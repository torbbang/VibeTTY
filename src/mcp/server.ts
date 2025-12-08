import * as vscode from 'vscode';
import { SessionManager } from '../sessions/sessionManager';
import { ApprovalGate } from '../security/approvalGate';
import { getSupportedDeviceTypes } from '../device-types';
import { updateConnectionNotes, getConnectionNotes } from '../sessions/connections';
import { TOOL_DEFINITIONS } from './toolDefinitions';

// MCP Protocol Types
interface MCPRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: unknown;
}

interface MCPResponse {
    jsonrpc: '2.0';
    id: number | string;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

// Centralized parameter schemas for all MCP tools
const TOOL_PARAM_SCHEMAS: Record<string, Record<string, { type: string; required?: boolean }>> = {
    connect_host: {
        host_names: { type: 'string[]', required: true }
    },
    show_terminal: {
        terminal_name: { type: 'string', required: true }
    },
    send_to_terminal: {
        terminal_name: { type: 'string', required: true },
        commands: { type: 'string[]', required: true },
        add_newline: { type: 'boolean' }
    },
    auto_paginate: {
        terminal_name: { type: 'string', required: true }
    },
    read_output: {
        terminal_name: { type: 'string', required: true },
        lines: { type: 'number' }
    },
    set_device_type: {
        terminal_name: { type: 'string', required: true },
        device_type: { type: 'string', required: true }
    },
    update_connection_notes: {
        connection_name: { type: 'string', required: true },
        notes: { type: 'string', required: true }
    }
};

export class MCPServer {
    private sessionManager: SessionManager;
    private approvalGate = ApprovalGate.getInstance();
    private supportedDeviceTypes: string[];

    constructor(sessionManager: SessionManager) {
        this.sessionManager = sessionManager;
        this.supportedDeviceTypes = getSupportedDeviceTypes();
    }

    async handleRequest(request: MCPRequest): Promise<MCPResponse | null> {
        try {
            // Check if this is a notification (no id field)
            // Notifications should not receive responses per JSON-RPC spec
            if (request.id === undefined) {
                // Handle notifications silently
                if (request.method === 'notifications/initialized') {
                    // This is expected during initialization, just ignore it
                    return null;
                }
                // Unknown notification - ignore it
                return null;
            }

            switch (request.method) {
                case 'initialize':
                    return this.handleInitialize(request);
                case 'tools/list':
                    return this.handleToolsList(request);
                case 'tools/call':
                    return await this.handleToolCall(request);
                default:
                    return this.errorResponse(request.id, -32601, `Method not found: ${request.method}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            return this.errorResponse(request.id, -32603, message);
        }
    }

    private handleInitialize(request: MCPRequest): MCPResponse {
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                serverInfo: {
                    name: 'vibetty',
                    version: '0.1.0'
                }
            }
        };
    }

    private handleToolsList(request: MCPRequest): MCPResponse {
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: { tools: TOOL_DEFINITIONS }
        };
    }

    /**
     * Validate tool parameters with type checking
     */
    private validateParams(args: Record<string, unknown>, schema: Record<string, { type: string; required?: boolean }>): { valid: boolean; error?: string } {
        for (const [key, spec] of Object.entries(schema)) {
            const value = args[key];

            // Check required parameters
            if (spec.required && (value === undefined || value === null)) {
                return { valid: false, error: `Missing required parameter: ${key}` };
            }

            // Skip validation if optional and not provided
            if (value === undefined || value === null) {
                continue;
            }

            // Type validation
            switch (spec.type) {
                case 'string':
                    if (typeof value !== 'string') {
                        return { valid: false, error: `Parameter '${key}' must be a string, got ${typeof value}` };
                    }
                    break;
                case 'string[]':
                    if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
                        return { valid: false, error: `Parameter '${key}' must be an array of strings` };
                    }
                    break;
                case 'number':
                    if (typeof value !== 'number' || !Number.isFinite(value)) {
                        return { valid: false, error: `Parameter '${key}' must be a finite number` };
                    }
                    break;
                case 'boolean':
                    if (typeof value !== 'boolean') {
                        return { valid: false, error: `Parameter '${key}' must be a boolean` };
                    }
                    break;
            }
        }
        return { valid: true };
    }

    private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
        const params = request.params as { name: string; arguments?: Record<string, unknown> };
        const toolName = params.name;
        const args = params.arguments || {};

        // Validate parameters using centralized schemas (if schema exists for this tool)
        if (toolName in TOOL_PARAM_SCHEMAS) {
            const validation = this.validateParams(args, TOOL_PARAM_SCHEMAS[toolName]);
            if (!validation.valid) {
                return this.errorResponse(request.id, -32602, validation.error!);
            }
        }

        // The approval gate will automatically handle whether to prompt the user
        // based on the "strict mode" setting.

        switch (toolName) {
            case 'list_connections':
                return this.toolListConnections(request.id);

            case 'connect_host':
                return await this.toolConnectHost(request.id, args.host_names as string[]);

            case 'show_terminal':
                return this.toolShowTerminal(request.id, args.terminal_name as string);

            case 'send_to_terminal':
                return await this.toolSendToTerminal(
                    request.id,
                    args.terminal_name as string,
                    args.commands as string[],
                    args.add_newline as boolean | undefined
                );

            case 'auto_paginate':
                return await this.toolAutoPaginate(request.id, args.terminal_name as string);

            case 'read_output':
                return await this.toolReadOutput(
                    request.id,
                    args.terminal_name as string,
                    args.lines as number | undefined
                );

            case 'set_device_type':
                return await this.toolSetDeviceType(
                    request.id,
                    args.terminal_name as string,
                    args.device_type as string
                );

            case 'update_connection_notes':
                return await this.toolUpdateConnectionNotes(
                    request.id,
                    args.connection_name as string,
                    args.notes as string
                );


            default:
                return this.errorResponse(request.id, -32602, `Unknown tool: ${toolName}`);
        }
    }

    private toolListConnections(id: number | string): MCPResponse {
        const configured = this.sessionManager.getHosts();
        const activeSessions = this.sessionManager.getActiveSessions();

        interface ActiveSessionInfo {
            session_id: string;
            terminal_name: string;
            is_connected: boolean;
            subsession_path: Array<{ hostname: string; device_type: string; depth: number }>;
            current_context: { hostname: string; device_type: string; depth: number };
            is_subsession: boolean;
        }

        // Create a map of connection name -> list of active sessions with subsession info
        const activeSessionMap = new Map<string, ActiveSessionInfo[]>();
        for (const [sessionId, session] of activeSessions.entries()) {
            const name = session.connection.name;
            if (!activeSessionMap.has(name)) {
                activeSessionMap.set(name, []);
            }

            // Build subsession path information
            const subsessionPath = session.subSessionStack.map((hostname, index) => ({
                hostname: hostname,
                device_type: session.contextStack[index],
                depth: index
            }));

            activeSessionMap.get(name)!.push({
                session_id: sessionId,
                terminal_name: session.terminal.name,
                is_connected: session.pty.isConnected(),
                subsession_path: subsessionPath,
                current_context: {
                    hostname: session.subSessionStack[session.subSessionStack.length - 1],
                    device_type: session.contextStack[session.contextStack.length - 1],
                    depth: session.subSessionStack.length - 1
                },
                is_subsession: session.subSessionStack.length > 1
            });
        }

        const allConnections = configured.map(conn => {
            const activeSessions = activeSessionMap.get(conn.name) || [];
            return {
                ...conn,
                active_sessions: activeSessions,
                has_active_sessions: activeSessions.length > 0
            };
        });

        // Create summary
        const totalSessions = activeSessions.size;
        const connectedSessions = Array.from(activeSessions.values()).filter(s => s.pty.isConnected()).length;
        const disconnectedSessions = totalSessions - connectedSessions;
        const connectionsWithSessions = allConnections.filter(c => c.has_active_sessions).length;

        let summary = '';
        if (totalSessions === 0) {
            summary = 'No active sessions. Use connect_host to create a new connection.';
        } else {
            summary = `Found ${connectedSessions} connected session(s)`;
            if (disconnectedSessions > 0) {
                summary += ` and ${disconnectedSessions} disconnected session(s)`;
            }
            summary += ` across ${connectionsWithSessions} connection(s). REUSE connected sessions with send_to_terminal instead of creating new ones.`;
        }

        return {
            jsonrpc: '2.0',
            id,
            result: {
                content: [
                    {
                        type: 'text',
                        text: `${summary}\n\n${JSON.stringify(allConnections, null, 2)}`
                    }
                ]
            }
        };
    }

    /**
     * Wait for a connection to establish by monitoring initial output
     */
    private async waitForConnection(terminal: vscode.Terminal, timeoutMs: number = 30000): Promise<boolean> {
        const pty = this.sessionManager.getPty(terminal);
        if (!pty) {
            return false;
        }

        return new Promise((resolve) => {
            let hasOutput = false;
            let settleTimer: NodeJS.Timeout | undefined;

            const timeout = setTimeout(() => {
                cleanup();
                resolve(false); // Timeout
            }, timeoutMs);

            const dataHandler = () => {
                if (!hasOutput) {
                    hasOutput = true;
                    // Wait 1 second after first output for authentication to settle
                    settleTimer = setTimeout(() => {
                        cleanup();
                        resolve(true);
                    }, 1000);
                }
            };

            const exitHandler = () => {
                cleanup();
                resolve(false); // Connection failed
            };

            const cleanup = () => {
                clearTimeout(timeout);
                if (settleTimer) {
                    clearTimeout(settleTimer);
                }
                pty.off('data', dataHandler);
                pty.off('exit', exitHandler);
            };

            pty.on('data', dataHandler);
            pty.on('exit', exitHandler);
        });
    }

    private async toolConnectHost(id: number | string, hostNames: string[]): Promise<MCPResponse> {
        const activeSessions = this.sessionManager.getActiveSessions();

        const results: Array<{ host: string; terminal?: string; session_id?: string; error?: string; warning?: string; notes?: string }> = [];

        // Connect to hosts sequentially to avoid authentication prompt conflicts
        for (const hostName of hostNames) {
            // Check if there are already active sessions for this host
            const existingSessions = Array.from(activeSessions.values())
                .filter(session => session.connection.name === hostName);

            const connectionResult = this.sessionManager.connect(hostName, true);

            if (!connectionResult) {
                results.push({
                    host: hostName,
                    error: `Failed to connect to host: ${hostName}`
                });
                continue;
            }

            const { terminal, sessionId } = connectionResult;

            // Wait for connection to establish before proceeding to next host
            if (hostNames.length > 1) {
                const connected = await this.waitForConnection(terminal);
                if (!connected) {
                    results.push({
                        host: hostName,
                        terminal: terminal.name,
                        session_id: sessionId,
                        error: `Connection timeout or failed`
                    });
                    continue;
                }
            }

            // Get notes for this connection
            const notes = getConnectionNotes(hostName);

            const result: { host: string; terminal: string; session_id: string; warning?: string; notes?: string } = {
                host: hostName,
                terminal: terminal.name,
                session_id: sessionId,
                notes: notes
            };

            // Warn if there were already active sessions
            if (existingSessions.length > 0) {
                const existingNames = existingSessions.map(s => s.terminal.name).join(', ');
                result.warning = `${existingSessions.length} session(s) already active: ${existingNames}`;
            }

            results.push(result);
        }

        // Format response text
        const successCount = results.filter(r => !r.error).length;
        const failureCount = results.filter(r => r.error).length;

        let responseText = '';

        if (hostNames.length === 1) {
            // Single host - use original format
            const result = results[0];
            if (result.error) {
                return this.errorResponse(id, -32602, result.error);
            }
            responseText = `Connected to ${result.host}\nTerminal: ${result.terminal}\nSession ID: ${result.session_id}`;
            if (result.warning) {
                responseText += `\n\nWARNING: ${result.warning}. Consider reusing existing sessions instead of creating new ones to avoid resource waste.`;
            }
            // Include notes if available
            if (result.notes) {
                responseText += `\n\n📝 Connection Notes:\n${result.notes}`;
            }
            responseText += `\n\n💡 Use the session ID "${result.session_id}" when calling other MCP tools (send_to_terminal, read_output, etc.) to avoid ambiguity when multiple sessions exist for the same device.`;
        } else {
            // Multiple hosts - summary format
            responseText = `Connected ${successCount} of ${hostNames.length} host(s):\n\n`;

            for (const result of results) {
                if (result.error) {
                    responseText += `❌ ${result.host}: ${result.error}\n`;
                } else {
                    responseText += `✅ ${result.host} → ${result.terminal} (Session ID: ${result.session_id})`;
                    if (result.warning) {
                        responseText += ` (⚠️ ${result.warning})`;
                    }
                    if (result.notes) {
                        responseText += `\n   📝 ${result.notes.split('\n')[0]}...`; // Show first line only in multi-host mode
                    }
                    responseText += '\n';
                }
            }

            if (failureCount > 0) {
                responseText += `\n${failureCount} connection(s) failed.`;
            }

            responseText += `\n\n💡 Use the session IDs when calling other MCP tools to avoid ambiguity when multiple sessions exist.`;
        }

        return {
            jsonrpc: '2.0',
            id,
            result: {
                content: [
                    {
                        type: 'text',
                        text: responseText
                    }
                ]
            }
        };
    }

    /**
     * Find a terminal by name or session ID, with ambiguity detection
     */
    private findTerminal(terminalIdentifier: string): { terminal?: vscode.Terminal; sessionId?: string; error?: string } {
        const activeSessions = this.sessionManager.getActiveSessions();

        // First, try exact session ID match
        if (activeSessions.has(terminalIdentifier)) {
            const session = activeSessions.get(terminalIdentifier)!;
            return { terminal: session.terminal, sessionId: terminalIdentifier };
        }

        // Then try terminal name matching
        const matches: Array<{ terminal: vscode.Terminal; sessionId: string }> = [];
        for (const [sessionId, session] of activeSessions.entries()) {
            if (session.terminal.name.includes(terminalIdentifier)) {
                matches.push({ terminal: session.terminal, sessionId });
            }
        }

        if (matches.length === 0) {
            return { error: `No terminal found matching "${terminalIdentifier}". Use list_connections to see available sessions.` };
        }

        if (matches.length === 1) {
            return { terminal: matches[0].terminal, sessionId: matches[0].sessionId };
        }

        // Multiple matches - ambiguous
        const matchList = matches.map(m => `  - ${m.sessionId} (terminal: "${m.terminal.name}")`).join('\n');
        return {
            error: `Ambiguous terminal identifier "${terminalIdentifier}" matches ${matches.length} sessions:\n${matchList}\n\nPlease use the exact session_id from list_connections.`
        };
    }

    private async toolSendToTerminal(
        id: number | string,
        terminalName: string,
        commands: string[],
        addNewLine: boolean = true
    ): Promise<MCPResponse> {
        const result = this.findTerminal(terminalName);

        if (result.error) {
            return this.errorResponse(id, -32602, result.error);
        }

        const terminal = result.terminal!;

        if (!commands || commands.length === 0) {
            return this.errorResponse(id, -32602, 'No commands provided.');
        }

        // Join commands with newlines for approval
        const commandsText = commands.join('\n');

        const approvedText = await this.approvalGate.approveCommand({
            type: 'command',
            sessionId: terminal.name,
            content: commandsText,
            context: `send_to_terminal to ${terminalName} (${commands.length} command${commands.length > 1 ? 's' : ''})`,
            timestamp: new Date()
        });

        if (approvedText === null) {
            return this.errorResponse(id, -32603, 'User rejected the commands.');
        }

        // Show the terminal so user can see commands being executed
        terminal.show();

        // Send each approved command with optional newline and auto-pagination enabled
        const approvedCommands = approvedText.split('\n');
        for (const command of approvedCommands) {
            if (command.trim()) {  // Skip empty lines
                this.sessionManager.sendToTerminal(terminal, command, addNewLine, true);
            }
        }

        return {
            jsonrpc: '2.0',
            id,
            result: {
                content: [
                    {
                        type: 'text',
                        text: `Sent ${commands.length} command${commands.length > 1 ? 's' : ''} to terminal "${terminal.name}".`
                    }
                ]
            }
        };
    }

    private async toolAutoPaginate(id: number | string, terminalName: string): Promise<MCPResponse> {
        const result = this.findTerminal(terminalName);

        if (result.error) {
            return this.errorResponse(id, -32602, result.error);
        }

        const terminal = result.terminal!;

        const pty = this.sessionManager.getPty(terminal);
        if (!pty) {
            return this.errorResponse(id, -32602, `Could not get PTY for terminal: ${terminalName}`);
        }

        const patterns = (pty as any).vendor.paginationPromptPatterns;
        if (!patterns || patterns.length === 0) {
            const connection = this.sessionManager.getConnectionForTerminal(terminal);
            const currentDeviceType = connection?.device_type || 'generic';

            return this.errorResponse(
                id,
                -32602,
                `No pagination patterns defined for device type "${currentDeviceType}". ` +
                `Please use set_device_type tool to set the correct device type, then retry. ` +
                `Supported types: ${this.supportedDeviceTypes.join(', ')}`
            );
        }

        // Show the terminal so user can see pagination happening
        terminal.show();

        // Use the same real-time pagination mechanism as send_to_terminal
        // Send a space with auto-pagination enabled to trigger the event-driven detection
        this.sessionManager.sendToTerminal(terminal, ' ', false, true);

        // Wait briefly for pagination to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            jsonrpc: '2.0',
            id,
            result: {
                content: [
                    {
                        type: 'text',
                        text: 'Auto-pagination triggered. The terminal will automatically handle pagination prompts until the command completes.'
                    }
                ]
            }
        };
    }


    private toolShowTerminal(id: number | string, terminalName: string): MCPResponse {
        const result = this.findTerminal(terminalName);

        if (result.error) {
            return this.errorResponse(id, -32602, result.error);
        }

        const terminal = result.terminal!;

        terminal.show();

        return {
            jsonrpc: '2.0',
            id,
            result: {
                content: [
                    {
                        type: 'text',
                        text: `Showing terminal: ${terminal.name}`
                    }
                ]
            }
        };
    }

    private async toolReadOutput(
        id: number | string,
        terminalName: string,
        lines?: number
    ): Promise<MCPResponse> {
        const result = this.findTerminal(terminalName);

        if (result.error) {
            return this.errorResponse(id, -32602, result.error);
        }

        const terminal = result.terminal!;

        const pty = this.sessionManager.getPty(terminal);
        if (!pty) {
            return this.errorResponse(id, -32602, `Cannot read output: terminal not using custom PTY`);
        }

        // If lines is specified, get last N lines (stateless)
        // If lines is undefined, get new output since last read (stateful)
        const output = pty.getRecentOutput(lines);

        // Check if device type is set (not generic or undefined)
        const connection = this.sessionManager.getConnectionForTerminal(terminal);
        const currentDeviceType = connection?.device_type;
        const isDeviceTypeSet = currentDeviceType && currentDeviceType !== 'generic';

        let nudge = '';
        if (!isDeviceTypeSet) {
            nudge = `Note: Device type for session '${terminal.name}' is not set or was not auto-detected. Use the 'set_device_type' tool to set it for vendor-specific features like pagination handling and secret filtering. Examine the terminal output to determine the correct type. Supported types: ${this.supportedDeviceTypes.join(', ')}.\n\n`;
        }

        // Approval gate: ask user if they want to share this output with LLM
        const contentToApprove = nudge + (output || '(no new output)');
        const approvedOutput = await this.approvalGate.approveOutput({
            type: 'output',
            sessionId: terminal.name,
            content: contentToApprove,
            context: `read_output from ${terminalName}`,
            timestamp: new Date()
        });

        if (approvedOutput === null) {
            // User rejected sharing this output
            return this.errorResponse(
                id,
                -32603,
                'User rejected sharing terminal output with LLM (strict mode)'
            );
        }

        return {
            jsonrpc: '2.0',
            id,
            result: {
                content: [
                    {
                        type: 'text',
                        text: approvedOutput
                    }
                ]
            }
        };
    }

    private async toolSetDeviceType(
        id: number | string,
        terminalName: string,
        deviceType: string
    ): Promise<MCPResponse> {
        const result = this.findTerminal(terminalName);

        if (result.error) {
            return this.errorResponse(id, -32602, result.error);
        }

        const terminal = result.terminal!;

        const pty = this.sessionManager.getPty(terminal);
        if (!pty) {
            return this.errorResponse(id, -32602, `Could not get PTY for terminal: ${terminalName}`);
        }

        // Validate device type
        if (!this.supportedDeviceTypes.includes(deviceType)) {
            return this.errorResponse(
                id,
                -32602,
                `Invalid device type "${deviceType}". Supported types: ${this.supportedDeviceTypes.join(', ')}`
            );
        }

        // Set the vendor for the current session
        pty.setDeviceType(deviceType);

        // Persist the device type to settings for future sessions
        const persisted = await this.sessionManager.updateDeviceType(terminalName, deviceType);

        let text: string;
        if (persisted) {
            text = `Device type for terminal "${terminal.name}" set to "${deviceType}" and saved to settings for future connections.`;
        } else {
            text = `Device type for terminal "${terminal.name}" set to "${deviceType}" for this session only. Connection not found in settings, so it was not persisted.`;
        }

        return {
            jsonrpc: '2.0',
            id,
            result: {
                content: [
                    {
                        type: 'text',
                        text
                    }
                ],
                metadata: {
                    terminal_name: terminal.name,
                    device_type: deviceType,
                    persisted: persisted
                }
            }
        };
    }

    private async toolUpdateConnectionNotes(
        id: number | string,
        connectionName: string,
        notes: string
    ): Promise<MCPResponse> {
        try {
            await updateConnectionNotes(connectionName, notes);

            return {
                jsonrpc: '2.0',
                id,
                result: {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully updated notes for connection "${connectionName}". These notes will be available in future sessions.`
                        }
                    ]
                }
            };
        } catch (error) {
            return this.errorResponse(
                id,
                -32603,
                `Failed to update notes for "${connectionName}": ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private errorResponse(id: number | string, code: number, message: string): MCPResponse {
        return {
            jsonrpc: '2.0',
            id,
            error: { code, message }
        };
    }

    dispose(): void {
        // Cleanup if needed
    }
}
