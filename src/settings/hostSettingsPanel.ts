import * as vscode from 'vscode';
import { UnifiedConnection } from '../sessions/connections';
import { validatePortForward, validateProxyJump, validateProxyCommand } from '../utils/sshValidator';
import { SessionTreeProvider } from '../sidebar/sessionTree';

export class HostSettingsPanel {
    public static currentPanel: HostSettingsPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private isNewHost = false;
    private treeProvider?: SessionTreeProvider;

    private constructor(panel: vscode.WebviewPanel, private host: UnifiedConnection, private allHosts: UnifiedConnection[], isNewHost = false, treeProvider?: SessionTreeProvider) {
        this.isNewHost = isNewHost;
        this.treeProvider = treeProvider;
        this.panel = panel;

        // Set the HTML content
        this.panel.webview.html = this.getHtmlContent();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.command) {
                    case 'save':
                        void this.saveHostSettings(message.data);
                        break;
                    case 'cancel':
                        this.panel.dispose();
                        break;
                }
            },
            null,
            this.disposables
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(host: UnifiedConnection, allHosts: UnifiedConnection[]): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (HostSettingsPanel.currentPanel) {
            HostSettingsPanel.currentPanel.panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'hostSettings',
            `SSH Host: ${host.name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        HostSettingsPanel.currentPanel = new HostSettingsPanel(panel, host, allHosts, false);
    }

    public static showNew(host: UnifiedConnection, allHosts: UnifiedConnection[], treeProvider: SessionTreeProvider): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, dispose it first
        if (HostSettingsPanel.currentPanel) {
            HostSettingsPanel.currentPanel.dispose();
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'hostSettings',
            `New SSH Host: ${host.name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        HostSettingsPanel.currentPanel = new HostSettingsPanel(panel, host, allHosts, true, treeProvider);
    }

    private async saveHostSettings(data: Record<string, unknown>): Promise<void> {
        try {
            // Validate name format
            if (!data.name || typeof data.name !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(data.name)) {
                vscode.window.showErrorMessage('Connection name can only contain letters, numbers, hyphens, underscores, and dots');
                return;
            }

            // Check if new name conflicts with existing connections (only if name changed)
            const originalName = (typeof data.originalName === 'string' ? data.originalName : null) || this.host.name;
            if (data.name !== originalName) {
                // Name is changing - check for conflicts
                const allNames = this.allHosts.map(h => h.name);
                if (allNames.includes(data.name)) {
                    vscode.window.showErrorMessage(`Connection '${data.name}' already exists. Please choose a different name.`);
                    return;
                }
            }

            // Get current connections from settings
            const config = vscode.workspace.getConfiguration('vibetty');
            const connections = config.get<UnifiedConnection[]>('connections', []);

            // Build connection object dynamically based on type
            const newConnection: Record<string, unknown> = {
                name: data.name,
                type: data.type,
                folder: data.folder || undefined,
            };

            if (data.type === 'ssh') {
                if (data.hostname) {
                    newConnection.hostname = data.hostname;
                }
                if (data.user) {
                    newConnection.user = data.user;
                }
                if (data.port && data.port !== 22 && typeof data.port === 'string') {
                    newConnection.port = parseInt(data.port, 10);
                }
                if (data.identityFile && typeof data.identityFile === 'string') {
                    newConnection.identityFile = data.identityFile;
                }
                if (data.proxyJump && typeof data.proxyJump === 'string') {
                    const error = validateProxyJump(data.proxyJump);
                    if (error) {
                        vscode.window.showErrorMessage(`ProxyJump validation failed: ${error}`);
                        return;
                    }
                    newConnection.proxyJump = data.proxyJump;
                }
                if (data.proxyCommand && typeof data.proxyCommand === 'string') {
                    const error = validateProxyCommand(data.proxyCommand);
                    if (error) {
                        vscode.window.showErrorMessage(`ProxyCommand validation failed: ${error}`);
                        return;
                    }
                    newConnection.proxyCommand = data.proxyCommand;
                }
                if (data.localForward && Array.isArray(data.localForward)) {
                    const forwards = data.localForward.filter((f: string) => f.trim());
                    for (const fwd of forwards) {
                        const error = validatePortForward(fwd);
                        if (error) {
                            vscode.window.showErrorMessage(`Local forward validation failed: ${error} (${fwd})`);
                            return;
                        }
                    }
                    if (forwards.length > 0) {
                        newConnection.localForward = forwards;
                    }
                }
                if (data.remoteForward && Array.isArray(data.remoteForward)) {
                    const forwards = data.remoteForward.filter((f: string) => f.trim());
                    for (const fwd of forwards) {
                        const error = validatePortForward(fwd);
                        if (error) {
                            vscode.window.showErrorMessage(`Remote forward validation failed: ${error} (${fwd})`);
                            return;
                        }
                    }
                    if (forwards.length > 0) {
                        newConnection.remoteForward = forwards;
                    }
                }
                if (data.dynamicForward && Array.isArray(data.dynamicForward)) {
                    const forwards = data.dynamicForward.filter((f: string) => f.trim());
                    for (const fwd of forwards) {
                        const error = validatePortForward(fwd);
                        if (error) {
                            vscode.window.showErrorMessage(`Dynamic forward validation failed: ${error} (${fwd})`);
                            return;
                        }
                    }
                    if (forwards.length > 0) {
                        newConnection.dynamicForward = forwards;
                    }
                }
                if (data.device_type) {
                    newConnection.device_type = data.device_type;
                }
            } else if (data.type === 'telnet') {
                if (data.hostname) {
                    newConnection.hostname = data.hostname;
                }
                if (data.port && data.port !== 23 && typeof data.port === 'string') {
                    newConnection.port = parseInt(data.port, 10);
                }
            } else if (data.type === 'serial') {
                if (data.device && typeof data.device === 'string') {
                    newConnection.device = data.device;
                }
                if (data.baud && data.baud !== 9600 && typeof data.baud === 'string') {
                    newConnection.baud = parseInt(data.baud, 10);
                }
            }

            if (this.isNewHost) {
                // Add new connection
                connections.push(newConnection as unknown as UnifiedConnection);
                await config.update('connections', connections, vscode.ConfigurationTarget.Global);

                vscode.window.showInformationMessage(`Connection '${data.name}' added successfully`);
                this.panel.dispose();

                // Trigger a refresh of the session tree
                if (this.treeProvider) {
                    this.treeProvider.refresh();
                }
            } else {
                // Update existing connection
                const index = connections.findIndex(c => c.name === originalName);
                if (index >= 0) {
                    connections[index] = newConnection as unknown as UnifiedConnection;
                    await config.update('connections', connections, vscode.ConfigurationTarget.Global);

                    const message = data.name !== originalName
                        ? `Connection renamed from '${originalName}' to '${data.name}'`
                        : `Connection '${data.name}' updated successfully`;

                    vscode.window.showInformationMessage(message);
                    this.panel.dispose();

                    // Trigger a refresh of the session tree
                    vscode.commands.executeCommand('vibetty.refresh');
                } else {
                    vscode.window.showErrorMessage(`Could not find connection '${originalName}'`);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to update connection: ${message}`);
        }
    }

    private getHtmlContent(): string {
        const host = this.host;
        const panelTitle = this.isNewHost ? `New ${host.type.toUpperCase()} Connection` : `${host.type.toUpperCase()} Connection: ${host.name}`;

        const folderOptions = Array.from(new Set(this.allHosts.filter(h => h.folder).map(h => h.folder)))
            .map(folder => `<option value="${folder}" ${host.folder === folder ? 'selected' : ''}>${folder}</option>`)
            .join('\n');

        // General fields common to all connection types
        const commonFields = `
            <div class="form-group">
                <label for="alias">Alias (Connection Name)</label>
                <input type="text" id="alias" name="alias" value="${host.name}" placeholder="my-connection" ${this.isNewHost ? '' : 'data-original-name="' + host.name + '"'}>
                <div class="description">The name you use to connect</div>
            </div>

            <div class="form-group">
                <label for="folder">Folder</label>
                <select id="folderSelect" name="folderSelect">
                    <option value="">-- No Folder --</option>
                    ${folderOptions}
                    <option value="__new__" ${host.folder && !this.allHosts.some(h => h.folder === host.folder) ? 'selected' : ''}>-- New Folder... --</option>
                </select>
                <input type="text" id="folderCustom" name="folderCustom" value="${host.folder && !this.allHosts.some(h => h.folder === host.folder) ? host.folder : ''}" placeholder="Enter folder name" style="margin-top: 8px; display: ${host.folder && !this.allHosts.some(h => h.folder === host.folder) ? 'block' : 'none'};">
                <div class="description">Organize connections into folders in the sidebar</div>
            </div>
        `;

        let typeSpecificFields = '';
        let typeSpecificJs = '';

        if (host.type === 'ssh') {
            typeSpecificFields = this.getSshHtmlFields();
            typeSpecificJs = this.getSshJs();
        } else if (host.type === 'telnet') {
            typeSpecificFields = this.getTelnetHtmlFields();
            typeSpecificJs = this.getTelnetJs();
        } else if (host.type === 'serial') {
            typeSpecificFields = this.getSerialHtmlFields();
            typeSpecificJs = this.getSerialJs();
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${panelTitle}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }

        .form-group {
            margin-bottom: 20px;
            position: relative;
        }

        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        input, select, textarea {
            width: 100%;
            max-width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            box-sizing: border-box;
        }

        textarea {
            resize: vertical;
            min-height: 60px;
        }

        input:focus, textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .button-group {
            margin-top: 30px;
            display: flex;
            gap: 10px;
        }

        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .info {
            background-color: var(--vscode-editorInfo-background);
            border-left: 4px solid var(--vscode-editorInfo-foreground);
            padding: 12px;
            margin-bottom: 20px;
            font-size: 12px;
        }

        h1 {
            margin-top: 0;
            color: var(--vscode-foreground);
        }

        .description {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <h1>${panelTitle}</h1>

    <div class="info">
        Changes will be saved to VSCode settings (vibetty.connections)
    </div>

    <form id="hostForm">
        ${commonFields}
        ${typeSpecificFields}

        <div class="button-group">
            <button type="submit">Save Changes</button>
            <button type="button" class="secondary" id="cancelBtn">Cancel</button>
        </div>
    </form>

    <script>
        const vscode = acquireVsCodeApi();

        // Handle Folder select change
        const folderSelect = document.getElementById('folderSelect');
        const folderCustom = document.getElementById('folderCustom');

        folderSelect.addEventListener('change', () => {
            if (folderSelect.value === '__new__') {
                folderCustom.style.display = 'block';
                folderCustom.focus();
            } else {
                folderCustom.style.display = 'none';
                folderCustom.value = '';
            }
        });

        document.getElementById('hostForm').addEventListener('submit', (e) => {
            e.preventDefault();

            // Determine Folder value
            let folder = '';
            if (folderSelect.value === '__new__') {
                folder = folderCustom.value;
            } else if (folderSelect.value) {
                folder = folderSelect.value;
            }

            const aliasInput = document.getElementById('alias');
            const newAlias = aliasInput.value.trim();
            const originalName = aliasInput.getAttribute('data-original-name') || '${host.name}';

            const formData = {
                name: newAlias,
                originalName: originalName,
                type: '${host.type}', // Set the connection type
                folder: folder || undefined,
            };

            ${typeSpecificJs}

            vscode.postMessage({
                command: 'save',
                data: formData
            });
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
        });
    </script>
</body>
</html>`;
    }

    private getSshHtmlFields(): string {
        const host = this.host;
        const proxyJumpOptions = this.allHosts
            .filter(h => h.name !== host.name)
            .map(h => `<option value="${h.name}" ${host.proxyJump === h.name ? 'selected' : ''}>${h.name}${h.hostname ? ` (${h.hostname})` : ''}</option>`)
            .join('\n');

        return `
            <div class="form-group">
                <label for="hostname">Hostname / IP Address</label>
                <input type="text" id="hostname" name="hostname" value="${host.hostname || ''}" placeholder="example.com or 192.168.1.1">
                <div class="description">The actual server address to connect to</div>
            </div>

            <div class="form-group">
                <label for="device_type">Device Type</label>
                <select id="device_type" name="device_type">
                    ${this.getDeviceTypeOptions()}
                </select>
                <div class="description">Manually specify the device type to enable vendor-specific features.</div>
            </div>

            <div class="form-group">
                <label for="user">Username</label>
                <input type="text" id="user" name="user" value="${host.user || ''}" placeholder="root">
                <div class="description">SSH username (leave empty for default)</div>
            </div>

            <div class="form-group">
                <label for="port">Port</label>
                <input type="number" id="port" name="port" value="${host.port || 22}" min="1" max="65535">
                <div class="description">SSH port (default: 22)</div>
            </div>

            <div class="form-group">
                <label for="identityFile">Private Key (Identity File)</label>
                <input type="text" id="identityFile" name="identityFile" value="${host.identityFile || ''}" placeholder="~/.ssh/id_rsa">
                <div class="description">Path to SSH private key file</div>
            </div>

            <div class="form-group">
                <label for="proxyJump">ProxyJump (Bastion/Jump Host)</label>
                <select id="proxyJumpSelect" name="proxyJumpSelect">
                    <option value="">-- None --</option>
                    ${proxyJumpOptions}
                    <option value="__custom__" ${host.proxyJump && !this.allHosts.some(h => h.name === host.proxyJump) ? 'selected' : ''}>-- Custom --</option>
                </select>
                <input type="text" id="proxyJumpCustom" name="proxyJumpCustom" value="${host.proxyJump && !this.allHosts.some(h => h.name === host.proxyJump) ? host.proxyJump : ''}" placeholder="custom.example.com" style="margin-top: 8px; display: ${host.proxyJump && !this.allHosts.some(h => h.name === host.proxyJump) ? 'block' : 'none'};">
                <div class="description">Jump through another SSH host (bastion or jump server)</div>
            </div>

            <div class="form-group">
                <label for="proxyCommand">ProxyCommand</label>
                <input type="text" id="proxyCommand" name="proxyCommand" value="${host.proxyCommand || ''}" placeholder="ssh -W %h:%p bastion">
                <div class="description">Custom proxy command for advanced routing</div>
            </div>

            <div class="form-group">
                <label for="localForward">Local Port Forwards</label>
                <textarea id="localForward" name="localForward" rows="3" placeholder="8080:localhost:80\n3306:db.internal:3306">${(host.localForward || []).join('\n')}</textarea>
                <div class="description">Forward local ports to remote destinations (format: local_port:remote_host:remote_port, one per line)</div>
            </div>

            <div class="form-group">
                <label for="remoteForward">Remote Port Forwards</label>
                <textarea id="remoteForward" name="remoteForward" rows="3" placeholder="8080:localhost:3000">${(host.remoteForward || []).join('\n')}</textarea>
                <div class="description">Forward remote ports to local destinations (format: remote_port:local_host:local_port, one per line)</div>
            </div>

            <div class="form-group">
                <label for="dynamicForward">Dynamic Port Forwards (SOCKS)</label>
                <input type="text" id="dynamicForward" name="dynamicForward" value="${(host.dynamicForward || []).join(' ')}" placeholder="1080">
                <div class="description">Local SOCKS proxy ports (space-separated)</div>
            </div>
        `;
    }

    private getDeviceTypeOptions(): string {
        const host = this.host;
        const options = [
            { value: '', label: '-- Auto-Detect (Not Recommended) --' },
            { value: 'cisco_ios', label: 'Cisco IOS' },
            { value: 'cisco_iosxe', label: 'Cisco IOS-XE' },
            { value: 'cisco_nxos', label: 'Cisco NX-OS' },
            { value: 'cisco_asa', label: 'Cisco ASA' },
            { value: 'arista_eos', label: 'Arista EOS' },
            { value: 'juniper_junos', label: 'Juniper Junos' },
            { value: 'linux', label: 'Linux' },
            { value: 'generic', label: 'Generic' },
        ];

        return options.map(opt => 
            `<option value="${opt.value}" ${host.device_type === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('\n');
    }


    private getTelnetHtmlFields(): string {
        const host = this.host;
        return `
            <div class="form-group">
                <label for="hostname">Hostname / IP Address</label>
                <input type="text" id="hostname" name="hostname" value="${host.hostname || ''}" placeholder="example.com or 192.168.1.1">
                <div class="description">The actual server address to connect to</div>
            </div>

            <div class="form-group">
                <label for="port">Port</label>
                <input type="number" id="port" name="port" value="${host.port || 23}" min="1" max="65535">
                <div class="description">Telnet port (default: 23)</div>
            </div>
        `;
    }

    private getSerialHtmlFields(): string {
        const host = this.host;
        return `
            <div class="form-group">
                <label for="device">Device Path</label>
                <input type="text" id="device" name="device" value="${host.device || ''}" placeholder="/dev/ttyUSB0">
                <div class="description">Path to the serial device (e.g., /dev/ttyUSB0 or COM1)</div>
            </div>

            <div class="form-group">
                <label for="baud">Baud Rate</label>
                <input type="number" id="baud" name="baud" value="${host.baud || 9600}" min="1">
                <div class="description">Baud rate for the serial connection (default: 9600)</div>
            </div>
        `;
    }

    private getSshJs(): string {
        return `
            // Handle ProxyJump select change
            const proxyJumpSelect = document.getElementById('proxyJumpSelect');
            const proxyJumpCustom = document.getElementById('proxyJumpCustom');

            proxyJumpSelect.addEventListener('change', () => {
                if (proxyJumpSelect.value === '__custom__') {
                    proxyJumpCustom.style.display = 'block';
                    proxyJumpCustom.focus();
                } else {
                    proxyJumpCustom.style.display = 'none';
                    proxyJumpCustom.value = '';
                }
            });

            // Parse port forwarding fields
            const localForwardText = document.getElementById('localForward').value;
            const localForward = localForwardText.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            const remoteForwardText = document.getElementById('remoteForward').value;
            const remoteForward = remoteForwardText.split('\\n').map(l => l.trim()).filter(l => l.length > 0);

            const dynamicForwardText = document.getElementById('dynamicForward').value;
            const dynamicForward = dynamicForwardText.split(/\\s+/).map(p => p.trim()).filter(p => p.length > 0);

            // Determine ProxyJump value
            let proxyJump = '';
            if (proxyJumpSelect.value === '__custom__') {
                proxyJump = proxyJumpCustom.value;
            } else if (proxyJumpSelect.value) {
                proxyJump = proxyJumpSelect.value;
            }
            
            Object.assign(formData, {
                hostname: document.getElementById('hostname').value,
                user: document.getElementById('user').value,
                port: parseInt(document.getElementById('port').value) || 22,
                identityFile: document.getElementById('identityFile').value,
                proxyJump: proxyJump,
                proxyCommand: document.getElementById('proxyCommand').value,
                localForward: localForward.length > 0 ? localForward : undefined,
                remoteForward: remoteForward.length > 0 ? remoteForward : undefined,
                dynamicForward: dynamicForward.length > 0 ? dynamicForward : undefined,
                device_type: document.getElementById('device_type').value || undefined
            });
        `;
    }

    private getTelnetJs(): string {
        return `
            Object.assign(formData, {
                hostname: document.getElementById('hostname').value,
                port: parseInt(document.getElementById('port').value) || 23
            });
        `;
    }

    private getSerialJs(): string {
        return `
            Object.assign(formData, {
                device: document.getElementById('device').value,
                baud: parseInt(document.getElementById('baud').value) || 9600
            });
        `;
    }


    public dispose(): void {
        HostSettingsPanel.currentPanel = undefined;

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}