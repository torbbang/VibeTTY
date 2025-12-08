import * as vscode from 'vscode';
import { SessionManager } from '../sessions/sessionManager';
import { UnifiedConnection } from '../sessions/connections';
import { updateConnectionFolder } from '../sessions/connections';

type TreeNode = FolderItem | ConnectionItem;

export class SessionTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    // Drag and drop support
    readonly dropMimeTypes = ['application/vnd.code.tree.vibetty-sessions'];
    readonly dragMimeTypes = ['application/vnd.code.tree.vibetty-sessions'];

    constructor(private sessionManager: SessionManager) {}

    refresh(): void {
        this.sessionManager.loadConnections();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (!element) {
            // Root level: organize by folders
            const connections = this.sessionManager.getHosts();
            const allFolders = this.sessionManager.getFolders();
            const folders = new Map<string, UnifiedConnection[]>();
            const rootConnections: UnifiedConnection[] = [];

            // Initialize all folders (including empty ones)
            for (const folderName of allFolders) {
                folders.set(folderName, []);
            }

            // Populate folders with connections
            for (const conn of connections) {
                if (conn.folder) {
                    if (!folders.has(conn.folder)) {
                        folders.set(conn.folder, []);
                    }
                    folders.get(conn.folder)!.push(conn);
                } else {
                    rootConnections.push(conn);
                }
            }

            const items: TreeNode[] = [];

            // Add all folders (including empty ones)
            for (const [folderName, folderConns] of folders) {
                items.push(new FolderItem(folderName, folderConns));
            }

            // Add ungrouped connections
            for (const conn of rootConnections) {
                items.push(new ConnectionItem(conn));
            }

            return items;
        } else if (element instanceof FolderItem) {
            // Folder level: return connections in folder
            return element.connections.map(conn => new ConnectionItem(conn));
        }

        return [];
    }

    // Drag and drop handlers
    handleDrag(source: TreeNode[], dataTransfer: vscode.DataTransfer): void {
        // Only allow dragging connections, not folders
        const connections = source.filter(node => node instanceof ConnectionItem);
        if (connections.length > 0) {
            dataTransfer.set(
                'application/vnd.code.tree.vibetty-sessions',
                new vscode.DataTransferItem(connections)
            );
        }
    }

    async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.vibetty-sessions');
        if (!transferItem) {
            return;
        }

        const connections = transferItem.value as ConnectionItem[];
        if (!connections || connections.length === 0) {
            return;
        }

        // Determine target folder
        let targetFolder: string | undefined;
        if (target instanceof FolderItem) {
            targetFolder = target.folderName;
        } else if (target instanceof ConnectionItem && target.connection.folder) {
            targetFolder = target.connection.folder;
        } else if (!target) {
            // Dropped on root - remove from folder
            targetFolder = undefined;
        } else {
            // Dropped on a connection at root level - don't move
            return;
        }

        // Update each connection's folder
        for (const connItem of connections) {
            const conn = connItem.connection;

            // Skip if already in target folder
            if (conn.folder === targetFolder) {
                continue;
            }

            await this.updateConnectionFolder(conn.name, conn.type, targetFolder);
        }

        // Refresh the tree
        this.refresh();
    }

    private async updateConnectionFolder(
        connectionName: string,
        _connectionType: 'ssh' | 'telnet' | 'serial',
        newFolder: string | undefined
    ): Promise<void> {
        // All connections are now in VSCode settings
        try {
            await updateConnectionFolder(connectionName, newFolder);
            vscode.window.showInformationMessage(
                newFolder
                    ? `Moved '${connectionName}' to folder '${newFolder}'`
                    : `Moved '${connectionName}' to root`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to move connection: ${message}`);
        }
    }
}

class FolderItem extends vscode.TreeItem {
    constructor(
        public readonly folderName: string,
        public readonly connections: UnifiedConnection[]
    ) {
        super(folderName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'folder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.tooltip = `${connections.length} connection${connections.length !== 1 ? 's' : ''}`;
    }
}

class ConnectionItem extends vscode.TreeItem {
    constructor(public readonly connection: UnifiedConnection) {
        super(connection.name, vscode.TreeItemCollapsibleState.None);

        this.tooltip = this.buildTooltip();
        this.description = this.buildDescription();
        this.contextValue = `${connection.type}Connection`;
        this.iconPath = this.getIcon();

        // Make clickable to connect
        this.command = {
            command: 'vibetty.connect',
            title: 'Connect',
            arguments: [connection.name]
        };
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.connection.type) {
            case 'ssh':
                return new vscode.ThemeIcon('terminal');
            case 'telnet':
                return new vscode.ThemeIcon('plug');
            case 'serial':
                return new vscode.ThemeIcon('circuit-board');
            default:
                return new vscode.ThemeIcon('terminal');
        }
    }

    private buildTooltip(): string {
        const parts: string[] = [
            `Name: ${this.connection.name}`,
            `Type: ${this.connection.type.toUpperCase()}`
        ];

        if (this.connection.type === 'ssh') {
            if (this.connection.hostname) {
                parts.push(`Hostname: ${this.connection.hostname}`);
            }
            if (this.connection.user) {
                parts.push(`User: ${this.connection.user}`);
            }
            if (this.connection.port) {
                parts.push(`Port: ${this.connection.port}`);
            }
            if (this.connection.proxyJump) {
                parts.push(`ProxyJump: ${this.connection.proxyJump}`);
            }
        } else if (this.connection.type === 'telnet') {
            if (this.connection.hostname) {
                parts.push(`Hostname: ${this.connection.hostname}`);
            }
            if (this.connection.port) {
                parts.push(`Port: ${this.connection.port}`);
            }
        } else if (this.connection.type === 'serial') {
            if (this.connection.device) {
                parts.push(`Device: ${this.connection.device}`);
            }
            if (this.connection.baud) {
                parts.push(`Baud: ${this.connection.baud}`);
            }
        }

        return parts.join('\n');
    }

    private buildDescription(): string {
        if (this.connection.type === 'ssh') {
            if (this.connection.user && this.connection.hostname) {
                return `${this.connection.user}@${this.connection.hostname}`;
            }
            if (this.connection.hostname) {
                return this.connection.hostname;
            }
        } else if (this.connection.type === 'telnet' && this.connection.hostname) {
            return this.connection.hostname;
        } else if (this.connection.type === 'serial' && this.connection.device) {
            return this.connection.device;
        }
        return '';
    }
}
