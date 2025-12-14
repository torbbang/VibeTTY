import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// Use VSCode's bundled node-pty to avoid build/packaging issues
// VSCode already ships with node-pty for its integrated terminal
let nodePty: any;
try {
    nodePty = require(path.join(vscode.env.appRoot, 'node_modules.asar', 'node-pty'));
} catch (e) {
    // Fallback for unpacked installations
    nodePty = require(path.join(vscode.env.appRoot, 'node_modules', 'node-pty'));
}
import { PasswordFilter } from '../security/passwordFilter';
import { VisualHighlighter } from './visualHighlighter';
import { SessionLogger } from '../sessions/sessionLogger';
import { KeywordHighlighter } from '../highlighting/keywordHighlighter';
import { KeywordParser } from '../highlighting/keywordParser';
import { TerminalOutputProcessor } from './terminalOutputProcessor';
import { outputChannel } from '../utils/outputChannel';

import { getVendor, Vendor } from '../device-types';
import { genericVendor } from '../device-types/generic';

export interface SSHPseudoterminalOptions {
    name: string;
    command: string;
    args: string[];
    enableLogging?: boolean;
    logDirectory?: string;
}

export class SSHPseudoterminal extends EventEmitter implements vscode.Pseudoterminal {
    private static readonly DEFAULT_SCROLLBACK_LINES = 5000;
    private static readonly MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10MB hard limit
    private maxScrollbackLines: number;

    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<number | void>();
    private process?: any; // node-pty IPty interface
    private outputBuffer = '';
    private lastReadPosition = 0;
    private dimensions?: vscode.TerminalDimensions;
    private passwordPromptLine = '';
    private isBlinking = false;
    private promptDetectionTimer?: NodeJS.Timeout;
    private pendingLine = '';

    // Auth prompt patterns for comprehensive authentication detection
    private authPromptPatterns = {
        password: [
            'password:',
            'password for',
            'enter password',
            '\'s password:',  // user@host's password:
        ],
        passphrase: [
            'passphrase',
            'enter passphrase for',
            'bad passphrase',
        ],
        keyboardInteractive: [
            'verification code',
            'authentication code',
            'token',
            'otp',
            'challenge',
        ],
    };

    // Device detection
    public vendor: Vendor;

    // Sub-session detection state
    private _pendingSubSessionHost: string | null = null;
    private _subSessionDetectionTimer: NodeJS.Timeout | null = null;

    // Pagination detection
    private paginationBuffer = '';
    private isPaginating = false;
    private commandQueue: { text: string; addNewLine: boolean }[] = [];
    private autoPaginateEnabled = false; // Only auto-paginate for MCP commands

    // Password filtering
    private passwordFilter = PasswordFilter.getInstance();

    // Session logging
    private logger?: SessionLogger;

    // Keyword highlighting
    private keywordHighlighter = new KeywordHighlighter();

    private inputBuffer = '';
    private subsessionAttemptEmitter = new vscode.EventEmitter<string>();
    private visibleCommandLine = ''; // Tracks the actual visible command (cleaned)

    // Connection state tracking
    private _isConnected = false;

    public readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    public readonly onDidClose: vscode.Event<number | void> = this.closeEmitter.event;
    public readonly onDidAttemptSubsession: vscode.Event<string> = this.subsessionAttemptEmitter.event;

    constructor(private options: SSHPseudoterminalOptions) {
        super();
        this.vendor = genericVendor;

        // Read VSCode's terminal scrollback setting
        const config = vscode.workspace.getConfiguration('terminal.integrated');
        this.maxScrollbackLines = config.get<number>('scrollback', SSHPseudoterminal.DEFAULT_SCROLLBACK_LINES);

        // Ensure a reasonable minimum
        if (this.maxScrollbackLines < 100) {
            this.maxScrollbackLines = 100;
        }
    }

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.dimensions = initialDimensions;

        // Initialize session logger if enabled
        if (this.options.enableLogging) {
            const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            this.logger = new SessionLogger(sessionId, this.options.name, this.options.logDirectory);
            this.logger.start();
        }

        // Load keyword highlighting
        this.loadKeywordHighlighting();

        // Spawn SSH process with real PTY using node-pty
        // This gives SSH a real pseudo-terminal, preventing GUI password dialogs
        const sshArgs = ['-tt', ...this.options.args];

        // Spawn SSH process with real PTY
        this.process = nodePty.spawn(this.options.command, sshArgs, {
            name: 'xterm-256color',
            cols: initialDimensions?.columns || 80,
            rows: initialDimensions?.rows || 30,
            cwd: process.env.HOME || process.cwd(),
            env: {
                ...process.env,
                // Disable GUI password prompts - force PTY prompts
                DISPLAY: undefined,
                SSH_ASKPASS: undefined,
                SSH_ASKPASS_REQUIRE: 'never',
                // Terminal configuration (set via PTY options above)
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                // Disable pagers to prevent interactive prompts
                PAGER: 'cat',
                SYSTEMD_PAGER: '',
                GIT_PAGER: 'cat',
                // Force non-interactive mode for common tools
                DEBIAN_FRONTEND: 'noninteractive'
            }
        });

        // Mark as connected when process starts
        this._isConnected = true;

        // Handle data from PTY (combines stdout and stderr)
        this.process.onData((data: string) => {
            // node-pty provides data as string, not Buffer
            let text = data;

            // Apply keyword highlighting to terminal display
            const highlightedText = this.keywordHighlighter.highlight(text);

            this.outputBuffer += text; // Store unhighlighted for tools
            this.trimOutputBuffer();
            this.writeEmitter.fire(highlightedText); // Display highlighted
            this.emit('data', text); // Emit unhighlighted for detection

            // Log output (raw, no redaction, no highlighting)
            if (this.logger) {
                this.logger.write(text);
            }

            // Detect password prompts
            this.detectPasswordPrompt(text);

            // Detect sub-session status
            this._detectSubSessionStatus(text);

            // Detect pagination
            this.detectPaginationPrompt(text);
        });

        // Handle process exit
        this.process.onExit((e: { exitCode: number; signal?: number }) => {
            const code = e.exitCode;

            // Mark as disconnected
            this._isConnected = false;

            this.emit('exit', code);

            // Write disconnection banner instead of closing terminal
            const banner = this.createDisconnectionBanner(code);
            this.writeEmitter.fire(banner);

            // Log the disconnection
            if (this.logger) {
                this.logger.write(`\n[Session ended with exit code: ${code || 0}]\n`);
            }

            // Don't close the terminal - let user see the output and reconnect if needed
            // this.closeEmitter.fire(code || undefined);
        });
    }

    close(): void {
        // Stop logging
        if (this.logger) {
            this.logger.stop();
            this.logger = undefined;
        }

        this.stopBlinking();
        if (this.promptDetectionTimer) {
            clearTimeout(this.promptDetectionTimer);
            this.promptDetectionTimer = undefined;
        }
        if (this._subSessionDetectionTimer) {
            clearTimeout(this._subSessionDetectionTimer);
            this._subSessionDetectionTimer = null;
        }
        if (this.process) {
            this.process.kill();
        }
    }

    handleInput(data: string): void {
        // Stop blinking when user starts typing
        if (this.isBlinking) {
            this.stopBlinking();
        }

        if (this.process) {
            this.process.write(data);
        }

        // Update visible command line
        this.updateVisibleCommandLine(data);

        // Handle sub-session detection
        if (data === '\r' || data === '\n') { // User pressed Enter
            this.detectSubsession();

            // Reset buffers after command execution
            this.visibleCommandLine = '';
            this.inputBuffer = '';
        }
    }

    /**
     * Update the visible command line by processing terminal control sequences
     * This maintains an accurate representation of what the user is typing
     */
    private updateVisibleCommandLine(data: string): void {
        for (let i = 0; i < data.length; i++) {
            const char = data[i];
            const charCode = char.charCodeAt(0);

            // Handle Ctrl+C (cancel command) - clear the line
            if (charCode === 3) {
                this.visibleCommandLine = '';
                this.inputBuffer = '';
                continue;
            }
            // Handle Ctrl+U (clear line before cursor) - common on Unix/Cisco
            else if (charCode === 21) {
                this.visibleCommandLine = '';
                this.inputBuffer = '';
                continue;
            }
            // Handle Ctrl+W (delete word backwards)
            else if (charCode === 23) {
                // Remove last word
                this.visibleCommandLine = this.visibleCommandLine.trimEnd();
                const lastSpace = this.visibleCommandLine.lastIndexOf(' ');
                if (lastSpace >= 0) {
                    this.visibleCommandLine = this.visibleCommandLine.substring(0, lastSpace + 1);
                } else {
                    this.visibleCommandLine = '';
                }
                continue;
            }
            // Handle backspace (both \b and DEL)
            else if (char === '\b' || charCode === 127) {
                if (this.visibleCommandLine.length > 0) {
                    this.visibleCommandLine = this.visibleCommandLine.slice(0, -1);
                }
            }
            // Handle carriage return (reset line)
            else if (char === '\r') {
                // Don't reset here - we'll reset after subsession detection
                continue;
            }
            // Handle newline
            else if (char === '\n') {
                continue;
            }
            // Handle escape sequences (ANSI codes)
            else if (char === '\x1b') {
                // Skip entire escape sequence
                i = this.skipEscapeSequence(data, i);
            }
            // Handle control characters (Ctrl+A through Ctrl+Z, except those handled above)
            else if (charCode < 32 && charCode !== 9) { // Allow tab (9)
                // Skip other control characters
                continue;
            }
            // Regular printable character
            else {
                this.visibleCommandLine += char;
                this.inputBuffer += char; // Keep raw buffer for backward compatibility
            }
        }
    }

    /**
     * Skip ANSI escape sequence and return the new index
     */
    private skipEscapeSequence(data: string, startIndex: number): number {
        let i = startIndex + 1; // Skip the ESC character

        if (i >= data.length) {
            return i;
        }

        // Check for CSI (Control Sequence Introducer) - ESC [
        if (data[i] === '[') {
            i++;
            // Skip until we find the final character (a letter)
            while (i < data.length) {
                const code = data.charCodeAt(i);
                // Final character is typically @ through ~
                if (code >= 64 && code <= 126) {
                    return i;
                }
                i++;
            }
        }
        // Check for OSC (Operating System Command) - ESC ]
        else if (data[i] === ']') {
            i++;
            // Skip until we find BEL or ST (ESC \)
            while (i < data.length) {
                if (data[i] === '\x07') { // BEL
                    return i;
                }
                if (data[i] === '\x1b' && i + 1 < data.length && data[i + 1] === '\\') {
                    return i + 1;
                }
                i++;
            }
        }
        // Other escape sequences (e.g., ESC ( or ESC ))
        else {
            return i; // Skip one more character
        }

        return i;
    }

    /**
     * Detect subsession attempts (ssh/telnet commands)
     */
    private detectSubsession(): void {
        const command = this.visibleCommandLine.trim();

        if (command.length > 0 && !this._pendingSubSessionHost) { // Don't start a new detection if one is pending
            const patterns = this.vendor.subSessionCommandPatterns || [];

            for (const pattern of patterns) {
                const match = command.match(pattern);
                if (match) {
                    const subsessionHostname = match[3] || match[2] || match[1];

                    if (subsessionHostname && subsessionHostname !== 'ssh' && subsessionHostname !== 'telnet') {
                        this._pendingSubSessionHost = subsessionHostname;

                        // Set a timeout to cancel the detection
                        if (this._subSessionDetectionTimer) {
                            clearTimeout(this._subSessionDetectionTimer);
                        }
                        this._subSessionDetectionTimer = setTimeout(() => {
                            this._pendingSubSessionHost = null;
                            this._subSessionDetectionTimer = null;
                        }, 5000); // 5 second timeout

                        break;
                    }
                }
            }
        }
    }

    private _detectSubSessionStatus(data: string): void {
        if (!this._pendingSubSessionHost) {
            return;
        }

        // IMPORTANT: Check failure patterns FIRST before success patterns
        // This prevents false positives when error messages are followed by the original prompt
        // Example: "% Unknown command\nR01#" - we need to catch the error, not the prompt
        const failurePatterns = this.vendor.subSessionFailurePatterns || [];
        for (const pattern of failurePatterns) {
            if (pattern.test(data)) {
                if (this._subSessionDetectionTimer) {
                    clearTimeout(this._subSessionDetectionTimer);
                    this._subSessionDetectionTimer = null;
                }
                this._pendingSubSessionHost = null;
                return; // Stop processing once failure is detected
            }
        }

        const successPatterns = this.vendor.subSessionSuccessPatterns || [];
        for (const pattern of successPatterns) {
            if (pattern.test(data)) {
                this.subsessionAttemptEmitter.fire(this._pendingSubSessionHost);
                if (this._subSessionDetectionTimer) {
                    clearTimeout(this._subSessionDetectionTimer);
                    this._subSessionDetectionTimer = null;
                }
                this._pendingSubSessionHost = null;
                return; // Stop processing once success is detected
            }
        }
    }

    setDimensions(dimensions: vscode.TerminalDimensions): void {
        // Store dimensions for reference
        this.dimensions = dimensions;

        // Now we can dynamically resize the PTY!
        if (this.process && this.dimensions) {
            this.process.resize(this.dimensions.columns, this.dimensions.rows);
        }
    }

    /**
     * Enhanced authentication prompt detection supporting multiple auth methods
     * Replaces the old detectPasswordPrompt with comprehensive coverage
     */
    private async detectAuthPrompt(data: string): Promise<void> {
        // Clear any existing detection timer
        if (this.promptDetectionTimer) {
            clearTimeout(this.promptDetectionTimer);
        }

        // Accumulate data into pending line
        this.pendingLine += data;

        // Check for auth prompt patterns
        const lowerPending = this.pendingLine.toLowerCase();
        let promptType: 'password' | 'passphrase' | 'keyboardInteractive' | null = null;

        // Check password patterns first
        for (const pattern of this.authPromptPatterns.password) {
            if (lowerPending.includes(pattern)) {
                promptType = 'password';
                break;
            }
        }

        // Check passphrase patterns if not password
        if (!promptType) {
            for (const pattern of this.authPromptPatterns.passphrase) {
                if (lowerPending.includes(pattern)) {
                    promptType = 'passphrase';
                    break;
                }
            }
        }

        // Check keyboard-interactive patterns
        if (!promptType) {
            for (const pattern of this.authPromptPatterns.keyboardInteractive) {
                if (lowerPending.includes(pattern)) {
                    promptType = 'keyboardInteractive';
                    break;
                }
            }
        }

        const hasNoNewline = !this.pendingLine.includes('\n');

        if (promptType && hasNoNewline) {
            // Set a timer to detect if this is truly a prompt waiting for input
            this.promptDetectionTimer = setTimeout(async () => {
                if (this.pendingLine && !this.pendingLine.includes('\n')) {
                    const lastLine = this.pendingLine.split('\r').pop() || '';

                    if (lastLine.trim().length > 0) {
                        await this.handleAuthPrompt(lastLine.trim(), promptType!);
                    }
                    this.pendingLine = '';
                }
            }, 300);  // 300ms delay to avoid false positives
        }

        // Clear pending line on newline
        if (this.pendingLine.includes('\n')) {
            this.pendingLine = '';
        }
    }

    /**
     * Legacy password detection method - kept for compatibility
     * Now internally calls detectAuthPrompt for unified handling
     */
    private async detectPasswordPrompt(data: string): Promise<void> {
        await this.detectAuthPrompt(data);
    }

    /**
     * Handle authentication prompts by showing VSCode input box
     * Supports password, passphrase, and keyboard-interactive auth
     */
    private async handleAuthPrompt(prompt: string, type: 'password' | 'passphrase' | 'keyboardInteractive'): Promise<void> {
        // Check if reactive prompts are enabled
        const config = vscode.workspace.getConfiguration('vibetty');
        const promptEnabled = config.get<boolean>('ssh.enableReactiveAuth', true);

        if (!promptEnabled) {
            // Fall back to manual input (existing blinking behavior)
            this.passwordPromptLine = prompt;
            this.startBlinking();
            this.emit('password-prompt', prompt);
            return;
        }

        // Determine prompt message based on type
        let promptMessage: string;
        let placeholder: string;

        switch (type) {
            case 'password':
                promptMessage = prompt || `Enter password for ${this.options.name}`;
                placeholder = 'Password';
                break;
            case 'passphrase':
                promptMessage = prompt || 'Enter passphrase for SSH key';
                placeholder = 'Passphrase';
                break;
            case 'keyboardInteractive':
                promptMessage = prompt;  // Use exact prompt from SSH
                placeholder = 'Enter response';
                break;
        }

        // Show VSCode input box
        const response = await vscode.window.showInputBox({
            password: true,
            prompt: promptMessage,
            placeHolder: placeholder,
            ignoreFocusOut: true,
        });

        if (response === undefined) {
            // User cancelled - close connection
            this.close();
            return;
        }

        // Write response to PTY
        if (this.process) {
            this.process.write(response + '\n');
        }
    }

    private startBlinking(): void {
        if (this.isBlinking) {
            return; // Already blinking
        }

        this.isBlinking = true;

        // Use visual highlighter for password prompt blinking
        VisualHighlighter.getInstance().setPasswordPrompt(this, this.passwordPromptLine);
    }

    private stopBlinking(): void {
        this.isBlinking = false;

        // Clear password prompt from visual highlighter
        VisualHighlighter.getInstance().clearPasswordPrompt(this);

        this.passwordPromptLine = '';
    }

    // Public API for MCP tools
    getOutputBuffer(): string {
        return this.filterOutputForLLM(this.outputBuffer);
    }

    /**
     * Process terminal control sequences to create a buffer that reflects what's actually displayed.
     * This handles carriage returns, backspaces, and line clearing that naturally remove pagination prompts.
     * The LLM sees the same output that renders in the terminal after pagination completes.
     */
    private removePaginationPrompts(output: string): string {
        return TerminalOutputProcessor.processControlSequences(output);
    }

    /**
     * Filter output for LLM consumption: remove secrets and pagination prompts
     */
    private filterOutputForLLM(output: string): string {
        // Filter secrets first
        let filtered = this.passwordFilter.filterOutput(output, {
            sessionId: this.options.name,
            deviceHost: this.options.name,
            secretPatterns: this.vendor.secretPatterns
        });

        // Remove pagination prompts
        return this.removePaginationPrompts(filtered);
    }

    getRecentOutput(lines?: number): string {
        let output: string;

        if (lines !== undefined) {
            // Legacy behavior: return last N lines (for backward compatibility)
            const allLines = this.outputBuffer.split('\n');
            output = allLines.slice(-lines).join('\n');
        } else {
            // Default behavior: return only new output since last read
            output = this.outputBuffer.substring(this.lastReadPosition);
            this.lastReadPosition = this.outputBuffer.length;
        }

        return this.filterOutputForLLM(output);
    }

    peekRecentOutput(): string {
        // Return new output without advancing the read position
        const output = this.outputBuffer.substring(this.lastReadPosition);
        return this.filterOutputForLLM(output);
    }


    clearOutputBuffer(): void {
        this.outputBuffer = '';
        this.lastReadPosition = 0;
    }

    sendText(text: string, addNewLine: boolean = true, autoPaginate: boolean = false): void {
        if (this.isPaginating) {
            // Queue the command if we're currently paginating
            this.commandQueue.push({ text, addNewLine });
            return;
        }

        // Enable auto-pagination if requested (for MCP commands)
        if (autoPaginate) {
            this.autoPaginateEnabled = true;
        }

        if (this.process) {
            // Restore placeholders to actual secrets before sending to device
            const restoredText = this.passwordFilter.restoreSecrets(text);

            // Track the command for subsession detection
            // Simulate user input by updating the visible command line
            this.visibleCommandLine = text.trim();

            if (addNewLine) {
                this._writeToProcess(restoredText + '\n');

                // Trigger subsession detection
                this.detectSubsession();

                // Reset buffer after command
                this.visibleCommandLine = '';
                this.inputBuffer = '';
            } else {
                this._writeToProcess(restoredText);
            }
        }
    }

    private _writeToProcess(text: string): void {
        if (this.process) {
            this.process.write(text);
        }
    }

    /**
     * Write output directly to the terminal display (not to remote shell)
     * Used for visual elements like highlighting legends
     */
    writeOutput(text: string): void {
        this.writeEmitter.fire(text);
    }

    public setDeviceType(deviceType: string): void {
        this.vendor = getVendor(deviceType);

        // Process any buffered pagination data now that we have a vendor
        if (this.paginationBuffer) {
            this.detectPaginationPrompt(''); // Pass empty string to process buffer
        }
    }

    /**
     * Check if the underlying SSH/Telnet/Serial connection is still active
     * Returns false if the process has exited (even if terminal UI is still open)
     */
    public isConnected(): boolean {
        return this._isConnected;
    }

    /**
     * Detect pagination prompts (like "-- More --") in terminal output
     * This is a stub method for future pagination detection functionality
     */
    private detectPaginationPrompt(text: string): void {
        // Only auto-paginate if explicitly enabled (for MCP commands)
        if (!this.autoPaginateEnabled) {
            return;
        }

        if (!this.vendor || !this.vendor.paginationPromptPatterns?.length) {
            if (this.isPaginating) {
                this.isPaginating = false;
                this.autoPaginateEnabled = false;
                this.sendQueuedCommands();
            }
            return;
        }

        this.paginationBuffer += text;
        // Strip ANSI codes but DON'T trim - pagination patterns may have significant whitespace
        const cleanedBuffer = this.paginationBuffer.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

        let foundMore = false;
        for (const pattern of this.vendor.paginationPromptPatterns) {
            if (cleanedBuffer.endsWith(pattern)) {
                foundMore = true;
                break;
            }
        }

        if (foundMore) {
            this.isPaginating = true;
            this.paginationBuffer = '';
            this._writeToProcess(' ');
        } else if (this.isPaginating) {
            // Get last line for prompt detection (trim here is OK since prompts don't have trailing spaces)
            const lastLine = cleanedBuffer.split('\n').pop()?.trim() || '';
            const isPrompt = this.vendor.promptPatterns?.some(p => p.test(lastLine));

            if (isPrompt) {
                this.isPaginating = false;
                this.autoPaginateEnabled = false;
                this.paginationBuffer = '';
                this.sendQueuedCommands();
            }
        }
    }

    private sendQueuedCommands(): void {
        while (this.commandQueue.length > 0) {
            const command = this.commandQueue.shift();
            if (command) {
                this.sendText(command.text, command.addNewLine);
            }
        }
    }


    /**
     * Trim output buffer to maintain maximum scrollback lines and byte size
     * Uses the VSCode terminal.integrated.scrollback setting (default 5000)
     * Also enforces a hard byte limit to prevent memory exhaustion
     */
    private trimOutputBuffer(): void {
        // First, enforce absolute byte limit to prevent memory exhaustion
        const bufferBytes = Buffer.byteLength(this.outputBuffer, 'utf8');
        if (bufferBytes > SSHPseudoterminal.MAX_BUFFER_BYTES) {
            // Trim to 80% of max to avoid constant trimming
            const targetBytes = Math.floor(SSHPseudoterminal.MAX_BUFFER_BYTES * 0.8);
            let trimmedBuffer = this.outputBuffer;

            // Binary search to find approximate cut point
            while (Buffer.byteLength(trimmedBuffer, 'utf8') > targetBytes) {
                const cutRatio = targetBytes / Buffer.byteLength(trimmedBuffer, 'utf8');
                const cutPoint = Math.floor(trimmedBuffer.length * cutRatio);
                trimmedBuffer = trimmedBuffer.substring(trimmedBuffer.length - cutPoint);
            }

            this.outputBuffer = trimmedBuffer;
            outputChannel.warn(`Buffer exceeded ${SSHPseudoterminal.MAX_BUFFER_BYTES} bytes, trimmed to ${Buffer.byteLength(this.outputBuffer, 'utf8')} bytes`);
        }

        // Then apply line-based trimming
        const lines = this.outputBuffer.split('\n');
        if (lines.length > this.maxScrollbackLines) {
            const linesToKeep = lines.slice(-this.maxScrollbackLines);
            this.outputBuffer = linesToKeep.join('\n');

            // Adjust lastReadPosition if it's beyond the new buffer
            const newBufferLength = this.outputBuffer.length;
            if (this.lastReadPosition > newBufferLength) {
                this.lastReadPosition = newBufferLength;
            }
        }
    }

    /**
     * Enable logging for this session
     */
    enableLogging(logDirectory?: string): void {
        if (!this.logger) {
            const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            this.logger = new SessionLogger(sessionId, this.options.name, logDirectory);
            this.logger.start();
        }
    }

    /**
     * Disable logging for this session
     */
    disableLogging(): void {
        if (this.logger) {
            this.logger.stop();
            this.logger = undefined;
        }
    }

    /**
     * Check if logging is enabled
     */
    isLoggingEnabled(): boolean {
        return this.logger !== undefined;
    }

    /**
     * Get current log file path (if logging is enabled)
     */
    getLogFilePath(): string | undefined {
        return this.logger?.getLogFilePath();
    }

    /**
     * Create a disconnection banner to display when SSH session ends
     */
    private createDisconnectionBanner(exitCode: number | null): string {
        const timestamp = new Date().toISOString();
        const code = exitCode ?? 0;

        // ANSI color codes
        const red = '\x1b[31m';
        const yellow = '\x1b[33m';
        const reset = '\x1b[0m';
        const bold = '\x1b[1m';

        // Different messages based on exit code
        let statusColor = red;
        let statusText = 'DISCONNECTED';
        let reason = '';

        if (code === 0) {
            statusColor = yellow;
            statusText = 'DISCONNECTED';
            reason = 'Session ended normally';
        } else if (code === 255) {
            statusColor = red;
            statusText = 'CONNECTION FAILED';
            reason = 'SSH connection error (exit code 255)';
        } else {
            statusColor = red;
            statusText = 'DISCONNECTED';
            reason = `Session ended with exit code ${code}`;
        }

        const banner = `\r\n\r\n` +
            `${bold}${statusColor}┌${'─'.repeat(70)}┐${reset}\r\n` +
            `${bold}${statusColor}│${' '.repeat(70)}│${reset}\r\n` +
            `${bold}${statusColor}│${' '.repeat(25)}${statusText}${' '.repeat(70 - 25 - statusText.length)}│${reset}\r\n` +
            `${bold}${statusColor}│${' '.repeat(70)}│${reset}\r\n` +
            `${bold}${statusColor}│  ${reset}${reason}${' '.repeat(68 - reason.length)}${bold}${statusColor}│${reset}\r\n` +
            `${bold}${statusColor}│  ${reset}Time: ${timestamp}${' '.repeat(68 - 6 - timestamp.length)}${bold}${statusColor}│${reset}\r\n` +
            `${bold}${statusColor}│${' '.repeat(70)}│${reset}\r\n` +
            `${bold}${statusColor}└${'─'.repeat(70)}┘${reset}\r\n\r\n`;

        return banner;
    }

    /**
     * Load keyword highlighting from configuration
     */
    private loadKeywordHighlighting(): void {
        const config = vscode.workspace.getConfiguration('vibetty');
        const highlightingEnabled = config.get<boolean>('highlighting.enabled', true);

        if (!highlightingEnabled) {
            this.keywordHighlighter.setEnabled(false);
            return;
        }

        // Only use custom keyword file if specified
        const customFile = config.get<string>('highlighting.customKeywordFile', '');

        if (!customFile) {
            // No keyword file configured, disable highlighting
            this.keywordHighlighter.setEnabled(false);
            return;
        }

        // Expand tilde to home directory (supports both ~ and ~username)
        let keywordFilePath = customFile;
        if (keywordFilePath.startsWith('~/') || keywordFilePath === '~') {
            // Simple tilde expansion for current user
            keywordFilePath = path.join(os.homedir(), keywordFilePath.substring(1));
        } else if (keywordFilePath.startsWith('~')) {
            // ~username expansion
            // On Unix systems, this would need to look up the user's home directory
            // For simplicity, we just replace ~ with home directory
            // (proper ~username expansion requires native modules or /etc/passwd parsing)
            outputChannel.warn(`Tilde expansion for other users (~username) not fully supported. Using current user's home directory.`);
            keywordFilePath = path.join(os.homedir(), keywordFilePath.substring(1));
        }

        // Check if file exists
        if (!fs.existsSync(keywordFilePath)) {
            outputChannel.warn(`Keyword file not found: ${keywordFilePath}`);
            this.keywordHighlighter.setEnabled(false);
            return;
        }

        // Load and parse keyword file
        try {
            const content = fs.readFileSync(keywordFilePath, 'utf-8');
            const keywordSets = KeywordParser.parse(content);
            this.keywordHighlighter.setKeywordSets(keywordSets);
        } catch {
            // Silently disable highlighting if file can't be loaded
            this.keywordHighlighter.setEnabled(false);
        }
    }
}

