import * as vscode from 'vscode';
import { UnifiedConnection, SSHConnection, getConnectionsFromSettings, getConnectionFolders, validateConnection } from './connections';
import { SSHPseudoterminal } from '../terminal/sshPseudoterminal';
import { getSupportedDeviceTypes } from '../device-types';

interface ActiveSession {
    connection: UnifiedConnection;
    terminal: vscode.Terminal;
    pty: SSHPseudoterminal;
    contextStack: string[]; // A stack of device types, e.g., ['cisco_ios', 'fortinet_fortios']
    subSessionStack: string[];
}

export class SessionManager {
    private connections: UnifiedConnection[] = [];
    private activeSessions: Map<string, ActiveSession> = new Map();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.loadConnections();

        // Track terminal closures
        const closeListener = vscode.window.onDidCloseTerminal((terminal) => {
            for (const [id, session] of this.activeSessions) {
                if (session.terminal === terminal) {
                    this.activeSessions.delete(id);
                    break;
                }
            }
        });

        this.disposables.push(closeListener);
    }

    loadConnections(): void {
        // Load all connections from VSCode settings
        const settingsConnections = getConnectionsFromSettings();

        // Convert to unified format
        this.connections = settingsConnections.map(conn => {
            if (conn.type === 'ssh') {
                return {
                    name: conn.name,
                    type: 'ssh' as const,
                    hostname: conn.hostname,
                    port: conn.port,
                    user: conn.user,
                    proxyJump: conn.proxyJump,
                    proxyCommand: conn.proxyCommand,
                    identityFile: conn.identityFile,
                    folder: conn.folder,
                    localForward: conn.localForward,
                    remoteForward: conn.remoteForward,
                    dynamicForward: conn.dynamicForward,
                    device_type: conn.device_type,
                    serverAliveInterval: conn.serverAliveInterval
                };
            } else if (conn.type === 'telnet') {
                return {
                    name: conn.name,
                    type: 'telnet' as const,
                    hostname: conn.hostname,
                    port: conn.port || 23,
                    folder: conn.folder,
                    device_type: conn.device_type
                };
            } else {
                // serial
                return {
                    name: conn.name,
                    type: 'serial' as const,
                    device: conn.device,
                    baud: conn.baud || 9600,
                    folder: conn.folder,
                    device_type: conn.device_type
                };
            }
        });
    }

    getHosts(): UnifiedConnection[] {
        return this.connections;
    }

    getFolders(): string[] {
        return getConnectionFolders();
    }

    private buildConnectionCommand(connection: UnifiedConnection, hostName: string): { command: string; args: string[]; terminalName: string } | undefined {
        switch (connection.type) {
            case 'ssh':
                return this.buildSSHCommand(connection, hostName);
            case 'telnet':
                return this.buildTelnetCommand(connection, hostName);
            case 'serial':
                return this.buildSerialCommand(connection, hostName);
            default:
                vscode.window.showErrorMessage(`Unknown connection type: ${connection.type}`);
                return undefined;
        }
    }

    private buildSSHCommand(connection: UnifiedConnection, hostName: string): { command: string; args: string[]; terminalName: string } {
        const args: string[] = [];

        if (connection.port && connection.port !== 22) {
            args.push('-p', connection.port.toString());
        }

        if (connection.identityFile) {
            args.push('-i', connection.identityFile);
        }

        if (connection.proxyJump) {
            args.push('-J', connection.proxyJump);
        }

        if (connection.proxyCommand) {
            args.push('-o', `ProxyCommand=${connection.proxyCommand}`);
        }

        // Port forwarding
        this.addPortForwarding(args, connection);

        // ServerAliveInterval to prevent disconnects on idle
        this.addServerAliveInterval(args, connection as SSHConnection);

        // ConnectTimeout to fail fast when host is unreachable
        this.addConnectTimeout(args, connection as SSHConnection);

        // Target host
        const hostname = connection.hostname || connection.name;
        const target = connection.user ? `${connection.user}@${hostname}` : hostname;
        args.push(target);

        return {
            command: 'ssh',
            args,
            terminalName: `SSH: ${hostName}`
        };
    }

    private buildTelnetCommand(connection: UnifiedConnection, hostName: string): { command: string; args: string[]; terminalName: string } | undefined {
        if (!connection.hostname) {
            vscode.window.showErrorMessage(`Telnet connection missing hostname: ${hostName}`);
            return undefined;
        }

        // Validate hostname to prevent command injection
        // Allow: alphanumeric, dots, hyphens, colons (for IPv6), brackets (for IPv6)
        const hostnameRegex = /^[\w\-.:[\]]+$/;
        if (!hostnameRegex.test(connection.hostname)) {
            vscode.window.showErrorMessage(`Invalid hostname format: ${connection.hostname}`);
            return undefined;
        }

        const args = [connection.hostname];
        if (connection.port && connection.port !== 23) {
            // Validate port is a positive integer
            const portNum = Number(connection.port);
            if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
                vscode.window.showErrorMessage(`Invalid port number: ${connection.port}`);
                return undefined;
            }
            args.push(portNum.toString());
        }

        return {
            command: 'telnet',
            args,
            terminalName: `Telnet: ${hostName}`
        };
    }

    private buildSerialCommand(connection: UnifiedConnection, hostName: string): { command: string; args: string[]; terminalName: string } | undefined {
        if (!connection.device) {
            vscode.window.showErrorMessage(`Serial connection missing device: ${hostName}`);
            return undefined;
        }

        const args = [
            connection.device,
            (connection.baud || 9600).toString()
        ];

        return {
            command: 'screen',
            args,
            terminalName: `Serial: ${hostName}`
        };
    }

    private addPortForwarding(args: string[], connection: UnifiedConnection): void {
        if (connection.localForward) {
            connection.localForward.forEach(forward => args.push('-L', forward));
        }

        if (connection.remoteForward) {
            connection.remoteForward.forEach(forward => args.push('-R', forward));
        }

        if (connection.dynamicForward) {
            connection.dynamicForward.forEach(forward => args.push('-D', forward));
        }
    }

    private addServerAliveInterval(args: string[], connection: SSHConnection): void {
        const config = vscode.workspace.getConfiguration('vibetty');
        const defaultInterval = config.get<number>('ssh.serverAliveInterval', 60);
        const interval = connection.serverAliveInterval ?? defaultInterval;

        if (interval > 0) {
            args.push('-o', `ServerAliveInterval=${interval}`);
        }
    }

    private addConnectTimeout(args: string[], connection: SSHConnection): void {
        const config = vscode.workspace.getConfiguration('vibetty');
        const defaultTimeout = config.get<number>('ssh.connectTimeout', 10);
        const timeout = connection.connectTimeout ?? defaultTimeout;

        if (timeout > 0) {
            args.push('-o', `ConnectTimeout=${timeout}`);
        }
    }

    connect(hostName: string, autoShow: boolean = true): { terminal: vscode.Terminal; sessionId: string } | undefined {
        const connection = this.connections.find((c) => c.name === hostName);
        if (!connection) {
            vscode.window.showErrorMessage(`Connection not found: ${hostName}`);
            return undefined;
        }

        // Validate connection settings before attempting to connect
        const validationError = validateConnection(connection);
        if (validationError) {
            vscode.window.showErrorMessage(`Invalid connection settings for ${hostName}: ${validationError}`);
            return undefined;
        }

        // Ensure unique session ID even when connecting to same host multiple times in same millisecond
        const sessionId = `${hostName}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const commandSpec = this.buildConnectionCommand(connection, hostName);
        if (!commandSpec) {
            return undefined;
        }

        const { command, args, terminalName } = commandSpec;

        // Determine if logging should be enabled
        const config = vscode.workspace.getConfiguration('vibetty');
        const globalLoggingEnabled = config.get<boolean>('logging.enabled', false);
        const logDirectory = config.get<string>('logging.directory');
        const enableLogging = connection.enableLogging ?? globalLoggingEnabled;

        // Create custom pseudoterminal with output capture
        const pty = new SSHPseudoterminal({
            name: terminalName,
            command,
            args,
            enableLogging,
            logDirectory
        });

        const initialDeviceType = connection.device_type || 'generic';
        pty.setDeviceType(initialDeviceType);

        // Create VSCode terminal using our custom PTY
        const terminal = vscode.window.createTerminal({
            name: terminalName,
            pty,
            location: vscode.TerminalLocation.Editor
        });

        if (autoShow) {
            terminal.show();
        }

        this.activeSessions.set(sessionId, {
            connection,
            terminal,
            pty,
            contextStack: [initialDeviceType],
            subSessionStack: [connection.name]
        });

        // If device_type is not set, show a warning notification
        if (!connection.device_type) {
            vscode.window.showWarningMessage(
                `Secret filtering is disabled for '${hostName}'. Set the device type to enable it.`,
                'Set Device Type'
            ).then(selection => {
                if (selection === 'Set Device Type') {
                    vscode.commands.executeCommand('vibetty.showHostSettingsFor', hostName);
                }
            });
        }

        // Set up password prompt handling
        pty.on('password-prompt', () => {
            // Show notification
            vscode.window.showInformationMessage(
                `🔐 Password prompt detected on ${terminal.name}`
            );
            // Bring terminal to focus when password is needed
            terminal.show(false);
        });

        // Handle connection failures
        pty.on('exit', (code) => {
            // Show notification for failed connections (non-zero exit codes)
            if (code !== 0 && code !== null) {
                const message = code === 255
                    ? `❌ Connection to ${hostName} failed (SSH error)`
                    : `❌ Connection to ${hostName} ended with error (exit code ${code})`;

                vscode.window.showErrorMessage(message, 'Show Terminal').then(selection => {
                    if (selection === 'Show Terminal') {
                        terminal.show();
                    }
                });
            }
        });

        // Handle automatic sub-session detection
        pty.onDidAttemptSubsession(async (hostname) => {
            const choice = await vscode.window.showInformationMessage(
                `Sub-session to "${hostname}" detected. Switch context?`,
                'Switch Context',
                'Switch & Save Connection',
                'Ignore'
            );

            if (choice === 'Switch Context' || choice === 'Switch & Save Connection') {
                const deviceTypes = getSupportedDeviceTypes();
                const selectedDeviceType = await vscode.window.showQuickPick(deviceTypes, {
                    title: `Select device type for ${hostname}`
                });

                if (selectedDeviceType) {
                    this.startSubSession(terminal, selectedDeviceType, hostname);

                    // If user chose to save, create a new connection entry
                    if (choice === 'Switch & Save Connection') {
                        await this.saveSubSessionAsConnection(hostname, selectedDeviceType);
                    }
                }
            }
        });

        return { terminal, sessionId };
    }

    /**
     * Start a new sub-session context
     */
    public startSubSession(terminal: vscode.Terminal, newDeviceType: string, subSessionName: string): void {
        const session = this.getSessionByTerminal(terminal);
        if (session) {
            session.contextStack.push(newDeviceType);
            session.subSessionStack.push(subSessionName);
            session.pty.setDeviceType(newDeviceType);
            vscode.window.showInformationMessage(`Switched to ${subSessionName} (${newDeviceType}) context.`);
        }
    }

    /**
     * Save a subsession as a persistent connection
     */
    private async saveSubSessionAsConnection(hostname: string, deviceType: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('vibetty');
        const connections = config.get<UnifiedConnection[]>('connections', []);

        // Check if connection already exists
        const existingIndex = connections.findIndex(c => c.name === hostname || c.hostname === hostname);
        if (existingIndex !== -1) {
            // Update existing connection's device type
            connections[existingIndex].device_type = deviceType;
            await config.update('connections', connections, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Updated existing connection "${connections[existingIndex].name}" with device type ${deviceType}`);
        } else {
            // Create new SSH connection
            const newConnection: UnifiedConnection = {
                name: hostname,
                type: 'ssh',
                hostname: hostname,
                device_type: deviceType
            };

            connections.push(newConnection);
            await config.update('connections', connections, vscode.ConfigurationTarget.Global);

            // Reload connections
            this.loadConnections();

            vscode.window.showInformationMessage(`Saved "${hostname}" as new connection with device type ${deviceType}`);
        }
    }

    /**
     * End the current sub-session context
     */
    public endSubSession(terminal: vscode.Terminal): void {
        const session = this.getSessionByTerminal(terminal);
        if (session && session.contextStack.length > 1) {
            session.contextStack.pop();
            session.subSessionStack.pop();
            const newDeviceType = this.getCurrentDeviceType(terminal);
            const newSessionName = this.getCurrentSubSessionName(terminal);
            if (newDeviceType) {
                session.pty.setDeviceType(newDeviceType);
                vscode.window.showInformationMessage(`Reverted to ${newSessionName} (${newDeviceType}) context.`);
            }
        }
    }

    /**
     * Get the current device type for a terminal from the top of the context stack
     */
    public getCurrentDeviceType(terminal: vscode.Terminal): string | undefined {
        const session = this.getSessionByTerminal(terminal);
        if (session && session.contextStack.length > 0) {
            return session.contextStack[session.contextStack.length - 1];
        }
        return undefined;
    }

    public getCurrentSubSessionName(terminal: vscode.Terminal): string | undefined {
        const session = this.getSessionByTerminal(terminal);
        if (session && session.subSessionStack.length > 0) {
            return session.subSessionStack[session.subSessionStack.length - 1];
        }
        return undefined;
    }

    getActiveSessions(): Map<string, ActiveSession> {
        return this.activeSessions;
    }

    getActiveTerminals(): vscode.Terminal[] {
        return Array.from(this.activeSessions.values()).map((s) => s.terminal);
    }

    getPty(terminal: vscode.Terminal): SSHPseudoterminal | undefined {
        for (const session of this.activeSessions.values()) {
            if (session.terminal === terminal) {
                return session.pty;
            }
        }
        return undefined;
    }

    sendToTerminal(terminal: vscode.Terminal, text: string, addNewLine: boolean = true, autoPaginate: boolean = false): void {
        const pty = this.getPty(terminal);
        if (pty) {
            pty.sendText(text, addNewLine, autoPaginate);
        } else {
            // Fallback - no auto-pagination support for non-PTY terminals
            terminal.sendText(text, addNewLine);
        }
    }

    getSessionByTerminal(terminal: vscode.Terminal): ActiveSession | undefined {
        for (const session of this.activeSessions.values()) {
            if (session.terminal === terminal) {
                return session;
            }
        }
        return undefined;
    }

    /**
     * Get the connection associated with a terminal
     */
    getConnectionForTerminal(terminal: vscode.Terminal): UnifiedConnection | undefined {
        for (const session of this.activeSessions.values()) {
            if (session.terminal === terminal) {
                return session.connection;
            }
        }
        return undefined;
    }

    /**
     * Update device type for a connection and persist it to settings
     */
    async updateDeviceType(terminalName: string, deviceType: string): Promise<boolean> {
        // Find the session
        for (const session of this.activeSessions.values()) {
            if (session.terminal.name.includes(terminalName)) {
                const connection = session.connection;

                // Update in-memory connection
                connection.device_type = deviceType;

                // Update in VSCode settings
                const config = vscode.workspace.getConfiguration('vibetty');
                const connections = config.get<UnifiedConnection[]>('connections', []);

                const connectionIndex = connections.findIndex(c => c.name === connection.name);
                if (connectionIndex !== -1) {
                    connections[connectionIndex].device_type = deviceType;
                    await config.update('connections', connections, vscode.ConfigurationTarget.Global);
                    return true;
                } else {
                    return false;
                }
            }
        }
        return false;
    }

    /**
     * Enable logging for a terminal session
     */
    enableLogging(terminal: vscode.Terminal): void {
        const session = this.getSessionByTerminal(terminal);
        if (session) {
            const config = vscode.workspace.getConfiguration('vibetty');
            const logDirectory = config.get<string>('logging.directory');
            session.pty.enableLogging(logDirectory);

            const logPath = session.pty.getLogFilePath();
            if (logPath) {
                vscode.window.showInformationMessage(`Session logging enabled: ${logPath}`);
            }
        }
    }

    /**
     * Disable logging for a terminal session
     */
    disableLogging(terminal: vscode.Terminal): void {
        const session = this.getSessionByTerminal(terminal);
        if (session) {
            session.pty.disableLogging();
            vscode.window.showInformationMessage('Session logging disabled');
        }
    }

    /**
     * Check if logging is enabled for a terminal
     */
    isLoggingEnabled(terminal: vscode.Terminal): boolean {
        const session = this.getSessionByTerminal(terminal);
        return session?.pty.isLoggingEnabled() ?? false;
    }

    /**
     * Get log file path for a terminal (if logging is enabled)
     */
    getLogFilePath(terminal: vscode.Terminal): string | undefined {
        const session = this.getSessionByTerminal(terminal);
        return session?.pty.getLogFilePath();
    }

    dispose(): void {
        // Close all active terminal sessions
        for (const session of this.activeSessions.values()) {
            try {
                // Close the PTY process cleanly
                session.pty.close();
            } catch {
                // Ignore errors during cleanup
            }
        }

        // Clear the sessions map
        this.activeSessions.clear();

        // Dispose of all registered disposables
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
