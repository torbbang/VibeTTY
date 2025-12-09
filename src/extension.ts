import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { SessionTreeProvider } from './sidebar/sessionTree';
import { SessionManager } from './sessions/sessionManager';
import { MCPServer } from './mcp/server';
import { IPCServer } from './mcp/ipcServer';
import { checkMCPConfigs, generateConfigSnippet, getConfigUpdateProposal, applyConfigUpdate } from './mcp/configChecker';
import { HostSettingsPanel } from './settings/hostSettingsPanel';
import { UnifiedConnection, getConnectionNotes } from './sessions/connections';
import { ApprovalGate } from './security/approvalGate';
import { SecurityStatusBar } from './ui/statusBar';
import { OnboardingManager } from './ui/onboarding';
import { SecretRegistry } from './security/secretRegistry';
import { getSupportedDeviceTypes } from './device-types';

let sessionManager: SessionManager;
let sessionTreeProvider: SessionTreeProvider;
let mcpServer: MCPServer;
let ipcServer: IPCServer;
let statusBar: SecurityStatusBar;

export function activate(context: vscode.ExtensionContext): void {
    // Ensure terminal scrollback is set to a reasonable value
    ensureTerminalScrollback();

    // Show first-run welcome if this is the first time
    void OnboardingManager.showFirstRunWelcome(context);

    sessionManager = new SessionManager();
    sessionTreeProvider = new SessionTreeProvider(sessionManager);

    // Start MCP server with tree provider for refresh capability
    mcpServer = new MCPServer(sessionManager, sessionTreeProvider);
    ipcServer = new IPCServer(mcpServer);

    ipcServer.start()
        .then(() => {
            vscode.window.showInformationMessage('VibeTTY MCP server started on port 47632');
        })
        .catch((err) => {
            vscode.window.showErrorMessage(`Failed to start MCP server: ${err.message}`);
        });

    // Initialize status bar
    statusBar = SecurityStatusBar.getInstance();
    statusBar.show();

    // Register tree view
    const treeView = vscode.window.createTreeView('vibetty-sessions', {
        treeDataProvider: sessionTreeProvider,
        showCollapseAll: false,
        dragAndDropController: sessionTreeProvider
    });

    // Register commands
    const connectCmd = vscode.commands.registerCommand('vibetty.connect', (host: unknown) => {
        // Extract hostname from argument - VSCode Remote can serialize arguments unexpectedly
        let hostName: string | undefined;

        if (typeof host === 'string') {
            hostName = host;
        } else if (host && typeof host === 'object') {
            // VSCode Remote may wrap primitive arguments in objects during serialization
            const obj = host as Record<string, unknown>;

            // Try common property names
            if ('name' in obj && typeof obj.name === 'string') {
                hostName = obj.name;
            } else if (Object.keys(obj).length === 1) {
                // If there's only one property, try using its value
                const firstValue = Object.values(obj)[0];
                if (typeof firstValue === 'string') {
                    hostName = firstValue;
                }
            }
        }

        if (!hostName) {
            vscode.window.showErrorMessage(`Invalid connection parameter: ${String(host)}`);
            return;
        }

        sessionManager.connect(hostName); // Returns { terminal, sessionId } but we don't need it for UI commands
    });

    const refreshCmd = vscode.commands.registerCommand('vibetty.refresh', () => {
        sessionTreeProvider.refresh();
    });

    const editHostCmd = vscode.commands.registerCommand('vibetty.editHost', (treeItem) => {
        // The command receives a tree item from the context menu
        // Extract the actual connection object from it
        const connection = treeItem?.connection;
        if (connection) {
            HostSettingsPanel.show(connection, sessionManager.getHosts());
        } else {
            vscode.window.showErrorMessage('Could not load connection information');
        }
    });

    const copyConnectionCmd = vscode.commands.registerCommand('vibetty.copyConnection', async (treeItem) => {
        // Extract the connection to copy
        const sourceConnection = treeItem?.connection;
        if (!sourceConnection) {
            vscode.window.showErrorMessage('Could not load connection information');
            return;
        }

        // Prompt for new connection name
        const connectionName = await vscode.window.showInputBox({
            prompt: `Enter name for copied connection (copying from '${sourceConnection.name}')`,
            placeHolder: `${sourceConnection.name}-copy`,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Connection name cannot be empty';
                }
                if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
                    return 'Connection name can only contain letters, numbers, hyphens, underscores, and dots';
                }
                // Check if connection already exists
                const existingConnections = sessionManager.getHosts();
                if (existingConnections.some(c => c.name === value)) {
                    return `Connection '${value}' already exists`;
                }
                return null;
            }
        });

        if (!connectionName) {
            return;
        }

        // Create a copy of the connection with the new name
        const copiedConnection: UnifiedConnection = {
            ...sourceConnection,
            name: connectionName
        };

        // Open the host settings panel for the new connection
        HostSettingsPanel.showNew(copiedConnection, sessionManager.getHosts(), sessionTreeProvider);
    });

    const showHostSettingsForCmd = vscode.commands.registerCommand('vibetty.showHostSettingsFor', (hostName: string) => {
        const connection = sessionManager.getHosts().find(h => h.name === hostName);
        if (connection) {
            HostSettingsPanel.show(connection, sessionManager.getHosts());
        } else {
            vscode.window.showErrorMessage(`Could not find connection: ${hostName}`);
        }
    });

    const addHostCmd = vscode.commands.registerCommand('vibetty.addHost', async () => {
        // First, ask for connection type
        const connectionType = await vscode.window.showQuickPick(
            [
                { label: 'SSH', description: 'Secure Shell connection', value: 'ssh' },
                { label: 'Telnet', description: 'Telnet connection', value: 'telnet' },
                { label: 'Serial', description: 'Serial port connection', value: 'serial' }
            ],
            {
                placeHolder: 'Select connection type'
            }
        );

        if (!connectionType) {
            return;
        }

        // Prompt for connection name
        const connectionName = await vscode.window.showInputBox({
            prompt: `Enter ${connectionType.label} connection name`,
            placeHolder: connectionType.value === 'ssh' ? 'my-server' : connectionType.value === 'telnet' ? 'router1' : 'switch-console',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Connection name cannot be empty';
                }
                if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
                    return 'Connection name can only contain letters, numbers, hyphens, underscores, and dots';
                }
                // Check if connection already exists
                const existingConnections = sessionManager.getHosts();
                if (existingConnections.some(c => c.name === value)) {
                    return `Connection '${value}' already exists`;
                }
                return null;
            }
        });

        if (!connectionName) {
            return;
        }

        // Create appropriate connection object based on type
        let newConnection: UnifiedConnection;

        if (connectionType.value === 'ssh') {
            newConnection = {
                name: connectionName,
                type: 'ssh',
                hostname: '',
                user: '',
                port: 22
            };
        } else if (connectionType.value === 'telnet') {
            newConnection = {
                name: connectionName,
                type: 'telnet',
                hostname: '',
                port: 23
            };
        } else if (connectionType.value === 'serial') {
            newConnection = {
                name: connectionName,
                type: 'serial',
                device: '',
                baud: 9600
            };
        } else {
            return; // Should not happen given quick pick values
        }
        
        // Show the settings panel for configuration
        HostSettingsPanel.showNew(newConnection, sessionManager.getHosts(), sessionTreeProvider);
    });

    const deleteHostCmd = vscode.commands.registerCommand('vibetty.deleteHost', async (treeItem) => {
        const connection = treeItem?.connection;
        if (!connection) {
            vscode.window.showErrorMessage('Could not load connection information');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete connection '${connection.name}'?`,
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            const { deleteConnection } = await import('./sessions/connections');
            await deleteConnection(connection.name);
            vscode.window.showInformationMessage(`Connection '${connection.name}' deleted`);
            sessionTreeProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    const viewNotesCmd = vscode.commands.registerCommand('vibetty.viewNotes', (treeItem) => {
        const connection = treeItem?.connection;
        if (!connection) {
            vscode.window.showErrorMessage('Could not load connection information');
            return;
        }

        const notes = getConnectionNotes(connection.name);

        const panel = vscode.window.createWebviewPanel(
            'vibettyConnectionNotes',
            `Notes: ${connection.name}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        const notesContent = notes || '_No notes available for this connection._';

        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connection Notes</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
        }
        em {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <h1>📝 ${connection.name}</h1>
    <div id="notes"></div>
    <script>
        const vscode = acquireVsCodeApi();
        const notesText = ${JSON.stringify(notesContent)};

        // Simple markdown-like rendering
        let html = notesText;

        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold
        html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');

        // Inline code
        html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

        // Line breaks
        html = html.replace(/\\n/g, '<br>');

        document.getElementById('notes').innerHTML = html;
    </script>
</body>
</html>`;
    });

    async function handleClientConfiguration(client: 'claude-code' | 'cline' | 'gemini') {
        const update = getConfigUpdateProposal(client);
    
        if (update) {
            // Show diff in editor
            const oldUri = vscode.Uri.parse(`vibetty-config:old/${update.path}`);
            const newUri = vscode.Uri.parse(`vibetty-config:new/${update.path}`);
    
            // Register content provider for the diff
            const provider = new (class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(uri: vscode.Uri): string {
                    if (uri.path.startsWith('old/')) {
                        return update.currentContent;
                    } else {
                        return update.newContent;
                    }
                }
            })();
    
            const registration = vscode.workspace.registerTextDocumentContentProvider('vibetty-config', provider);
    
            await vscode.commands.executeCommand(
                'vscode.diff',
                oldUri,
                newUri,
                `VibeTTY Config Change: ${update.client}`
            );
    
            const approve = await vscode.window.showInformationMessage(
                `Apply this change to ${update.path}?`,
                'Apply',
                'Cancel'
            );
    
            // Close the diff editor
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            registration.dispose();
    
            if (approve === 'Apply') {
                applyConfigUpdate(update);
                vscode.window.showInformationMessage(
                    `VibeTTY MCP configured for ${update.client}. Restart the client to apply.`
                );
            }
        }
    }

    const checkConfigCmd = vscode.commands.registerCommand('vibetty.checkConfig', async () => {
        const status = checkMCPConfigs();

        const configuredClients = [];
        if (status.claudeCode) {
            configuredClients.push('Claude Code');
        }
        if (status.cline) {
            configuredClients.push('Cline');
        }
        if (status.gemini) {
            configuredClients.push('Gemini');
        }

        const infoMessage = configuredClients.length > 0
            ? `VibeTTY MCP configured for: ${configuredClients.join(', ')}`
            : 'VibeTTY MCP not configured in any detected client.';

        const configOptions: vscode.QuickPickItem[] = [
            { label: 'Configure Claude Code' },
            { label: 'Configure Cline' },
            { label: 'Configure Gemini' },
            { label: 'Copy Config' }
        ];

        const selectedOption = await vscode.window.showQuickPick(configOptions, {
            placeHolder: infoMessage,
            title: 'VibeTTY MCP Configuration'
        });

        if (!selectedOption) {
            return;
        }

        const action = selectedOption.label;

        if (action === 'Copy Config') {
            const snippet = generateConfigSnippet();
            await vscode.env.clipboard.writeText(snippet);
            vscode.window.showInformationMessage(
                'MCP config copied to clipboard. Add to your AI client config file.'
            );
        } else if (action === 'Configure Claude Code' || action === 'Configure Cline' || action === 'Configure Gemini') {
            let client: 'claude-code' | 'cline' | 'gemini' | undefined;
            if (action === 'Configure Claude Code') {
                client = 'claude-code';
            } else if (action === 'Configure Gemini') {
                client = 'gemini';
            } else if (action === 'Configure Cline') {
                client = 'cline';
            }

            if (client) {
                await handleClientConfiguration(client);
            }
        }
    });

    const configureMcpCmd = vscode.commands.registerCommand('vibetty.configureMcp', async () => {
        const action = await vscode.window.showQuickPick(
            [
                'Configure Claude Code',
                'Configure Cline',
                'Configure Gemini',
                'Copy Config'
            ],
            {
                title: 'Configure MCP Client'
            }
        );

        if (action === 'Copy Config') {
            const snippet = generateConfigSnippet();
            await vscode.env.clipboard.writeText(snippet);
            vscode.window.showInformationMessage(
                'MCP config copied to clipboard. Add to your AI client config file.'
            );
        } else if (action) {
            let client: 'claude-code' | 'cline' | 'gemini' | undefined;
            if (action === 'Configure Claude Code') {
                client = 'claude-code';
            } else if (action === 'Configure Gemini') {
                client = 'gemini';
            } else if (action === 'Configure Cline') {
                client = 'cline';
            }

            if (client) {
                await handleClientConfiguration(client);
            }
        }
    });


    // Strict mode commands
    const enableStrictModeCmd = vscode.commands.registerCommand('vibetty.enableStrictMode', async () => {
        const gate = ApprovalGate.getInstance();
        const confirmed = await gate.confirmEnableStrictMode();
        if (confirmed) {
            statusBar.refresh();
            await OnboardingManager.showWelcome(context);
        }
    });

    const disableStrictModeCmd = vscode.commands.registerCommand('vibetty.disableStrictMode', () => {
        const gate = ApprovalGate.getInstance();
        gate.setStrictMode(false);
        statusBar.refresh();
        vscode.window.showInformationMessage('Strict Mode disabled. LLM can access terminal output automatically.');
    });

    const strictModeStatusCmd = vscode.commands.registerCommand('vibetty.strictModeStatus', () => {
        const gate = ApprovalGate.getInstance();
        const status = gate.isStrictMode() ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Strict Mode is currently ${status}`);
    });

    // New: Toggle command (for status bar)
    const toggleStrictModeCmd = vscode.commands.registerCommand('vibetty.toggleStrictMode', async () => {
        const gate = ApprovalGate.getInstance();
        const isEnabled = gate.isStrictMode();

        if (isEnabled) {
            gate.setStrictMode(false);
            statusBar.refresh();
            vscode.window.showInformationMessage('Strict Mode disabled');
        } else {
            const confirmed = await gate.confirmEnableStrictMode();
            if (confirmed) {
                statusBar.refresh();
                await OnboardingManager.showWelcome(context);
            }
        }
    });

    // New: Show secret statistics
    const showSecretStatsCmd = vscode.commands.registerCommand('vibetty.showSecretStats', () => {
        const registry = SecretRegistry.getInstance();
        const secrets = registry.listSecrets();

        if (secrets.length === 0) {
            vscode.window.showInformationMessage('No secrets have been filtered yet');
            return;
        }

        const items = secrets.map(s => ({
            label: s.placeholder,
            description: s.context,
            detail: `From: ${s.deviceHost || s.sessionId} at ${s.timestamp.toLocaleTimeString()}`
        }));

        vscode.window.showQuickPick(items, {
            title: `${secrets.length} Secret${secrets.length === 1 ? '' : 's'} Filtered`,
            placeHolder: 'Click on a secret to see its context'
        });
    });

    // New: Reset onboarding (for testing/debugging)
    const resetOnboardingCmd = vscode.commands.registerCommand('vibetty.resetOnboarding', async () => {
        await OnboardingManager.reset(context);
    });

    // Session logging commands
    const enableLoggingCmd = vscode.commands.registerCommand('vibetty.enableLogging', () => {
        const activeTerminal = vscode.window.activeTerminal;
        if (!activeTerminal) {
            vscode.window.showErrorMessage('No active terminal. Please select a terminal first.');
            return;
        }

        sessionManager.enableLogging(activeTerminal);
    });

    const disableLoggingCmd = vscode.commands.registerCommand('vibetty.disableLogging', () => {
        const activeTerminal = vscode.window.activeTerminal;
        if (!activeTerminal) {
            vscode.window.showErrorMessage('No active terminal. Please select a terminal first.');
            return;
        }

        sessionManager.disableLogging(activeTerminal);
    });

    const openLogFolderCmd = vscode.commands.registerCommand('vibetty.openLogFolder', () => {
        const config = vscode.workspace.getConfiguration('vibetty');
        let logDirectory = config.get<string>('logging.directory', '~/.vibetty/logs');

        // Expand tilde to home directory
        if (logDirectory.startsWith('~')) {
            logDirectory = path.join(os.homedir(), logDirectory.substring(1));
        }

        // Ensure directory exists
        if (!fs.existsSync(logDirectory)) {
            fs.mkdirSync(logDirectory, { recursive: true });
        }

        // Open in file explorer
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(logDirectory));
    });

    const startSubSessionCmd = vscode.commands.registerCommand('vibetty.startSubSession', async () => {
        const activeTerminal = vscode.window.activeTerminal;
        if (!activeTerminal) {
            vscode.window.showErrorMessage('No active terminal found.');
            return;
        }

        const session = sessionManager.getSessionByTerminal(activeTerminal);
        if (!session) {
            vscode.window.showErrorMessage('The active terminal is not a VibeTTY session.');
            return;
        }

        const subSessionName = await vscode.window.showInputBox({
            prompt: 'Enter a name for the sub-session (e.g., the hostname you are connecting to)',
            placeHolder: 'e.g., core-router-01'
        });

        if (!subSessionName) {
            return;
        }

        const deviceTypes = getSupportedDeviceTypes();
        const selectedDeviceType = await vscode.window.showQuickPick(deviceTypes, {
            title: 'Select the device type for the sub-session'
        });

        if (!selectedDeviceType) {
            return;
        }

        sessionManager.startSubSession(activeTerminal, selectedDeviceType, subSessionName);
    });

    const endSubSessionCmd = vscode.commands.registerCommand('vibetty.endSubSession', () => {
        const activeTerminal = vscode.window.activeTerminal;
        if (!activeTerminal) {
            vscode.window.showErrorMessage('No active terminal found.');
            return;
        }

        const session = sessionManager.getSessionByTerminal(activeTerminal);
        if (!session) {
            vscode.window.showErrorMessage('The active terminal is not a VibeTTY session.');
            return;
        }

        sessionManager.endSubSession(activeTerminal);
    });

    context.subscriptions.push(
        treeView,
        connectCmd,
        refreshCmd,
        editHostCmd,
        copyConnectionCmd,
        showHostSettingsForCmd,
        addHostCmd,
        deleteHostCmd,
        viewNotesCmd,
        checkConfigCmd,
        configureMcpCmd,
        enableStrictModeCmd,
        disableStrictModeCmd,
        strictModeStatusCmd,
        toggleStrictModeCmd,
        showSecretStatsCmd,
        resetOnboardingCmd,
        enableLoggingCmd,
        disableLoggingCmd,
        openLogFolderCmd,
        startSubSessionCmd,
        endSubSessionCmd,
        vscode.window.onDidChangeActiveTerminal(() => {
            statusBar.updateStatusBar(sessionManager);
        })
    );
}

/**
 * Ensure terminal scrollback is set to a reasonable value for network device sessions
 * If the user's setting is less than 5000, offer to increase it
 */
function ensureTerminalScrollback(): void {
    const config = vscode.workspace.getConfiguration('terminal.integrated');
    const currentScrollback = config.get<number>('scrollback', 1000);
    const recommendedScrollback = 5000;

    if (currentScrollback < recommendedScrollback) {
        vscode.window.showInformationMessage(
            `VibeTTY works best with a larger terminal scrollback buffer. Current: ${currentScrollback} lines. Recommended: ${recommendedScrollback} lines.`,
            'Update to 5000',
            'Keep Current',
            'Update to 10000'
        ).then(async (selection) => {
            if (selection === 'Update to 5000') {
                await config.update('scrollback', 5000, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('Terminal scrollback updated to 5000 lines.');
            } else if (selection === 'Update to 10000') {
                await config.update('scrollback', 10000, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('Terminal scrollback updated to 10000 lines.');
            }
        });
    }
}

export function deactivate(): void {
    if (ipcServer) {
        ipcServer.stop();
    }
    if (mcpServer) {
        mcpServer.dispose();
    }
    if (sessionManager) {
        sessionManager.dispose();
    }
}