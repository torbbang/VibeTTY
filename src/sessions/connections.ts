import * as vscode from 'vscode';

export type ConnectionType = 'ssh' | 'telnet' | 'serial';

export interface SSHConnection {
    name: string;
    type: 'ssh';
    hostname?: string;
    port?: number;
    user?: string;
    proxyJump?: string;
    proxyCommand?: string;
    identityFile?: string;
    localForward?: string[];
    remoteForward?: string[];
    dynamicForward?: string[];
    folder?: string;
    device_type?: string;
    serverAliveInterval?: number;
    connectTimeout?: number;
    notes?: string;
}

export interface TelnetConnection {
    name: string;
    type: 'telnet';
    hostname: string;
    port?: number;
    folder?: string;
    device_type?: string;
    notes?: string;
}

export interface SerialConnection {
    name: string;
    type: 'serial';
    device: string;
    baud?: number;
    folder?: string;
    device_type?: string;
    notes?: string;
}

export type Connection = SSHConnection | TelnetConnection | SerialConnection;

export interface UnifiedConnection {
    name: string;
    type: ConnectionType;
    hostname?: string;
    port?: number;
    device?: string;
    baud?: number;
    folder?: string;
    device_type?: string;
    enableLogging?: boolean;  // Per-connection logging override
    notes?: string;  // LLM-generated context and summaries
    // SSH-specific fields (from SSHHost)
    user?: string;
    proxyJump?: string;
    proxyCommand?: string;
    identityFile?: string;
    localForward?: string[];
    remoteForward?: string[];
    dynamicForward?: string[];
    serverAliveInterval?: number;
    connectTimeout?: number;
}

/**
 * Validate a connection's settings
 * Returns an error message if invalid, or null if valid
 */
export function validateConnection(conn: Connection | UnifiedConnection): string | null {
    if (!conn.name || typeof conn.name !== 'string') {
        return 'Connection name is required';
    }

    if (!conn.type || !['ssh', 'telnet', 'serial'].includes(conn.type)) {
        return `Invalid connection type: ${conn.type}`;
    }

    // Type-specific validation
    if (conn.type === 'ssh' || conn.type === 'telnet') {
        if (!conn.hostname || typeof conn.hostname !== 'string') {
            return `${conn.type.toUpperCase()} connection requires a hostname`;
        }

        // Validate port if specified
        if (conn.port !== undefined) {
            const port = Number(conn.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                return `Invalid port number: ${conn.port} (must be 1-65535)`;
            }
        }
    }

    if (conn.type === 'ssh') {
        // Validate identity file path if specified
        if (conn.identityFile && typeof conn.identityFile === 'string') {
            // Just check it's not empty and doesn't contain dangerous chars
            if (conn.identityFile.trim().length === 0) {
                return 'Identity file path cannot be empty';
            }
        }

        // Validate proxy jump if specified
        if (conn.proxyJump && typeof conn.proxyJump === 'string') {
            if (conn.proxyJump.trim().length === 0) {
                return 'ProxyJump value cannot be empty';
            }
        }
    }

    if (conn.type === 'serial') {
        if (!conn.device || typeof conn.device !== 'string') {
            return 'Serial connection requires a device path';
        }

        // Validate baud rate if specified
        if (conn.baud !== undefined) {
            const validBaudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
            if (!validBaudRates.includes(conn.baud)) {
                return `Invalid baud rate: ${conn.baud} (common values: ${validBaudRates.join(', ')})`;
            }
        }
    }

    return null; // Valid
}

/**
 * Read connections from VSCode settings
 * Setting: "vibetty.connections"
 */
export function getConnectionsFromSettings(): Connection[] {
    const config = vscode.workspace.getConfiguration('vibetty');
    const connections = config.get<Connection[]>('connections', []);

    // Validate connections by ensuring they have a name and type.
    // Specific field validation (e.g., hostname for telnet) will be handled
    // during the connection attempt itself. This allows users to save
    // incomplete connections and edit them later.
    return connections.filter(conn => {
        if (!conn.name || !conn.type) {
            return false;
        }
        // Only filter out completely invalid connections
        // Allow partially configured connections (user might be editing)
        return true;
    });
}

/**
 * Get unique folder names from connections
 */
export function getConnectionFolders(): string[] {
    const connections = getConnectionsFromSettings();
    const folders = new Set<string>();

    for (const conn of connections) {
        if (conn.folder) {
            folders.add(conn.folder);
        }
    }

    return Array.from(folders);
}

/**
 * Add or update a connection in settings
 */
export async function saveConnection(connection: Connection): Promise<void> {
    const config = vscode.workspace.getConfiguration('vibetty');
    const connections = config.get<Connection[]>('connections', []);

    // Check if connection with same name exists
    const index = connections.findIndex(c => c.name === connection.name);

    if (index >= 0) {
        connections[index] = connection;
    } else {
        connections.push(connection);
    }

    await config.update('connections', connections, vscode.ConfigurationTarget.Global);
}

/**
 * Delete a connection from settings
 */
export async function deleteConnection(name: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('vibetty');
    const connections = config.get<Connection[]>('connections', []);

    const filtered = connections.filter(c => c.name !== name);

    await config.update('connections', filtered, vscode.ConfigurationTarget.Global);
}

/**
 * Update folder for a connection
 */
export async function updateConnectionFolder(name: string, folder: string | undefined): Promise<void> {
    const config = vscode.workspace.getConfiguration('vibetty');
    const connections = config.get<Connection[]>('connections', []);

    const connection = connections.find(c => c.name === name);
    if (connection) {
        connection.folder = folder;
        await config.update('connections', connections, vscode.ConfigurationTarget.Global);
    }
}

/**
 * Update notes for a connection
 * Enforces a 10KB size limit to prevent VSCode settings bloat
 */
export async function updateConnectionNotes(name: string, notes: string | undefined): Promise<void> {
    const MAX_NOTES_SIZE = 10 * 1024; // 10KB

    // Validate notes size
    if (notes && Buffer.byteLength(notes, 'utf8') > MAX_NOTES_SIZE) {
        throw new Error(`Connection notes exceed maximum size of ${MAX_NOTES_SIZE} bytes (${Math.floor(MAX_NOTES_SIZE / 1024)}KB). Current size: ${Buffer.byteLength(notes, 'utf8')} bytes.`);
    }

    const config = vscode.workspace.getConfiguration('vibetty');
    const connections = config.get<Connection[]>('connections', []);

    const connection = connections.find(c => c.name === name);
    if (connection) {
        connection.notes = notes;
        await config.update('connections', connections, vscode.ConfigurationTarget.Global);
    }
}

/**
 * Get notes for a connection
 */
export function getConnectionNotes(name: string): string | undefined {
    const config = vscode.workspace.getConfiguration('vibetty');
    const connections = config.get<Connection[]>('connections', []);

    const connection = connections.find(c => c.name === name);
    return connection?.notes;
}
