import { SSHPseudoterminal } from './sshPseudoterminal';

export interface HighlightPattern {
    text: string;
    color: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
    label?: string;
}

export interface LineHighlightPattern {
    line_number: number;
    color: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
    label?: string;
}

interface BlinkState {
    pty: SSHPseudoterminal;
    terminalName?: string;
    passwordPromptLine?: string;
    highlightPatterns?: HighlightPattern[];
    highlightLines?: LineHighlightPattern[];
    baseOutput: string;
    cleanupTimer?: NodeJS.Timeout;
}

/**
 * Visual highlighter for terminal output using ANSI escape codes
 * Highlights are ephemeral and do not affect command history or LLM tools
 * Handles both user-requested highlights and password prompt highlighting
 */
export class VisualHighlighter {
    private static instance: VisualHighlighter;
    private blinkStates: Map<SSHPseudoterminal, BlinkState> = new Map();
    private globalInterval?: NodeJS.Timeout;
    private visible = true;

    // ANSI color codes
    private colorCodes: Record<string, string> = {
        red: '\x1b[41m\x1b[97m',
        green: '\x1b[42m\x1b[30m',
        yellow: '\x1b[43m\x1b[30m',
        blue: '\x1b[44m\x1b[97m',
        magenta: '\x1b[45m\x1b[97m',
        cyan: '\x1b[46m\x1b[30m',
        white: '\x1b[47m\x1b[30m'
    };
    private reset = '\x1b[0m';

    private constructor() {}

    static getInstance(): VisualHighlighter {
        if (!VisualHighlighter.instance) {
            VisualHighlighter.instance = new VisualHighlighter();
        }
        return VisualHighlighter.instance;
    }

    /**
     * Set password prompt for a PTY (will be highlighted in green)
     */
    setPasswordPrompt(pty: SSHPseudoterminal, promptLine: string): void {
        const state = this.getOrCreateState(pty);
        state.passwordPromptLine = promptLine;
        state.baseOutput = pty.getOutputBuffer();
        this.startBlinking();
    }

    /**
     * Clear password prompt for a PTY
     */
    clearPasswordPrompt(pty: SSHPseudoterminal): void {
        const state = this.blinkStates.get(pty);
        if (state) {
            state.passwordPromptLine = undefined;
            this.checkStopBlinking();
        }
    }

    /**
     * Highlight patterns in terminal output
     * Clears the terminal and re-displays all output with highlights applied inline
     */
    highlightOutput(
        pty: SSHPseudoterminal,
        terminalName: string,
        patterns: HighlightPattern[],
        lines: LineHighlightPattern[],
        durationSeconds: number = 10
    ): void {
        // Clear any existing user highlights for this terminal
        this.clearUserHighlight(terminalName);

        const originalOutput = pty.getOutputBuffer();
        const outputLines = originalOutput.split('\n');
        let hasMatches = false;

        // Check for text pattern matches
        if (patterns.length > 0) {
            for (const line of outputLines) {
                for (const pattern of patterns) {
                    if (line.includes(pattern.text)) {
                        hasMatches = true;
                        break;
                    }
                }
                if (hasMatches) break;
            }
        }

        // Check for line number matches
        if (!hasMatches && lines.length > 0) {
            for (const line of lines) {
                if (line.line_number >= 1 && line.line_number <= outputLines.length) {
                    hasMatches = true;
                    break;
                }
            }
        }

        if (hasMatches) {
            const state = this.getOrCreateState(pty);
            state.terminalName = terminalName;
            state.highlightPatterns = patterns;
            state.highlightLines = lines;
            state.baseOutput = originalOutput;
            this.startBlinking();

            // Schedule cleanup
            state.cleanupTimer = setTimeout(() => {
                this.clearUserHighlight(terminalName);
            }, durationSeconds * 1000);
        } else {
            // No matches found
            pty.writeOutput('\r\n=== No matches found for the specified patterns or lines ===\r\n');
        }
    }

    /**
     * Manually clear user-requested highlights (but keep password prompts)
     */
    clearUserHighlight(terminalName: string): void {
        for (const [_pty, state] of this.blinkStates) {
            if (state.terminalName === terminalName) {
                if (state.cleanupTimer) {
                    clearTimeout(state.cleanupTimer);
                    state.cleanupTimer = undefined;
                }
                state.highlightPatterns = undefined;
                state.highlightLines = undefined;
                state.terminalName = undefined;
                this.checkStopBlinking();
                break;
            }
        }
    }

    /**
     * Clear all blinking for a PTY and restore normal output
     */
    clearAll(pty: SSHPseudoterminal): void {
        const state = this.blinkStates.get(pty);
        if (state) {
            if (state.cleanupTimer) {
                clearTimeout(state.cleanupTimer);
            }
            // Restore normal output
            pty.writeOutput('\x1b[2J\x1b[H' + state.baseOutput);
            this.blinkStates.delete(pty);
            this.checkStopBlinking();
        }
    }

    /**
     * Check if a PTY has any active blinking
     */
    isBlinking(pty: SSHPseudoterminal): boolean {
        const state = this.blinkStates.get(pty);
        if (!state) {
            return false;
        }
        return !!(state.passwordPromptLine ||
                  (state.highlightPatterns && state.highlightPatterns.length > 0) ||
                  (state.highlightLines && state.highlightLines.length > 0));
    }

    private getOrCreateState(pty: SSHPseudoterminal): BlinkState {
        let state = this.blinkStates.get(pty);
        if (!state) {
            state = {
                pty,
                baseOutput: pty.getOutputBuffer()
            };
            this.blinkStates.set(pty, state);
        }
        return state;
    }

    private startBlinking(): void {
        if (this.globalInterval) {
            return; // Already blinking
        }

        // Start global blink cycle
        this.globalInterval = setInterval(() => {
            this.blinkCycle();
        }, 500);

        // Do initial blink immediately
        this.blinkCycle();
    }

    private blinkCycle(): void {
        // Process each PTY's blink state
        for (const [pty, state] of this.blinkStates) {
            const hasPasswordPrompt = !!state.passwordPromptLine;
            const hasHighlights = !!state.highlightPatterns && state.highlightPatterns.length > 0;
            const hasLineHighlights = !!state.highlightLines && state.highlightLines.length > 0;

            if (!hasPasswordPrompt && !hasHighlights && !hasLineHighlights) {
                continue; // Nothing to blink for this PTY
            }

            if (this.visible) {
                // Show highlighted version - just highlight the last line for password prompts
                if (hasPasswordPrompt && !hasHighlights && !hasLineHighlights) {
                    // For password prompts, only highlight the prompt line itself
                    const colorCode = this.colorCodes.green;
                    const highlightedPrompt = `${colorCode}${state.passwordPromptLine}${this.reset}`;
                    // Write just the highlighted prompt on the current line
                    pty.writeOutput(`\r${highlightedPrompt}`);
                } else {
                    // For user highlights, we need to redraw everything
                    const highlightedOutput = this.applyHighlights(
                        state.baseOutput,
                        state.passwordPromptLine,
                        state.highlightPatterns,
                        state.highlightLines
                    );
                    // Clear screen and redraw
                    pty.writeOutput('\x1b[2J\x1b[H' + highlightedOutput);
                }
            } else {
                // Hide highlights - for password prompts just rewrite the line
                if (hasPasswordPrompt && !hasHighlights && !hasLineHighlights) {
                    pty.writeOutput(`\r${state.passwordPromptLine}`);
                } else {
                    // Restore normal output
                    pty.writeOutput('\x1b[2J\x1b[H' + state.baseOutput);
                }
            }
        }

        // Toggle visibility for next cycle
        this.visible = !this.visible;
    }

    private applyHighlights(
        output: string,
        passwordPromptLine?: string,
        highlightPatterns?: HighlightPattern[],
        highlightLines?: LineHighlightPattern[]
    ): string {
        const lines = output.split('\n');

        return lines.map((line, index) => {
            let highlightedLine = line;

            // Apply line-based highlighting first
            if (highlightLines) {
                const lineMatch = highlightLines.find(h => h.line_number - 1 === index);
                if (lineMatch) {
                    const colorCode = this.colorCodes[lineMatch.color] || this.colorCodes.yellow;
                    // Highlight the entire line and skip other highlights for this line
                    return `${colorCode}${line}${this.reset}`;
                }
            }

            // Apply password prompt highlighting (green background)
            if (passwordPromptLine && line.includes(passwordPromptLine)) {
                highlightedLine = highlightedLine.replace(
                    passwordPromptLine,
                    `${this.colorCodes.green}${passwordPromptLine}${this.reset}`
                );
            }

            // Apply pattern highlights
            if (highlightPatterns) {
                for (const pattern of highlightPatterns) {
                    const colorCode = this.colorCodes[pattern.color] || this.colorCodes.yellow;
                    const escapedText = pattern.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    // Only apply if the text is not empty and the line contains it
                    if(escapedText.trim().length > 0){
                        const regex = new RegExp(escapedText, 'gi');
                        highlightedLine = highlightedLine.replace(
                            regex,
                            `${colorCode}$&${this.reset}`
                        );
                    }
                }
            }

            return highlightedLine;
        }).join('\r\n');
    }

    private checkStopBlinking(): void {
        // Check if any PTY still has active blinking
        let hasAnyBlinking = false;
        for (const state of this.blinkStates.values()) {
            if (state.passwordPromptLine ||
                (state.highlightPatterns && state.highlightPatterns.length > 0) ||
                (state.highlightLines && state.highlightLines.length > 0))
            {
                hasAnyBlinking = true;
                break;
            }
        }

        if (!hasAnyBlinking && this.globalInterval) {
            clearInterval(this.globalInterval);
            this.globalInterval = undefined;
            this.visible = true; // Reset for next time
        }
    }
}
