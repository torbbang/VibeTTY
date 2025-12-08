#!/usr/bin/env node
// This is a standalone MCP server CLI entry point
// It communicates with the VSCode extension via IPC

import * as net from 'net';
import * as readline from 'readline';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';

const IPC_PORT = 47632; // VibeTTY IPC port
const VIBETTY_DIR = path.join(os.homedir(), '.vibetty');
const LOG_FILE = path.join(VIBETTY_DIR, 'logs', 'mcp-debug.log');
const AUTH_TOKEN_FILE = path.join(VIBETTY_DIR, 'mcp_token');

interface JSONRPCRequest {
    jsonrpc: string;
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

// Only enable debug logging if VIBETTY_DEBUG environment variable is set
const DEBUG_ENABLED = process.env.VIBETTY_DEBUG === '1' || process.env.VIBETTY_DEBUG === 'true';
let logStream: fs.WriteStream | null = null;

// Setup file logging if debug is enabled
if (DEBUG_ENABLED) {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    }
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', mode: 0o600 });

    // Handle stream errors to prevent crashes
    logStream.on('error', (err) => {
        process.stderr.write(`Log stream error: ${err.message}\n`);
        logStream = null; // Disable logging on error
    });
}

function log(message: string): void {
    if (DEBUG_ENABLED && logStream) {
        const timestamp = new Date().toISOString();
        logStream.write(`[${timestamp}] ${message}\n`);
    }
}

class MCPBridge {
    private ipcClient: net.Socket | null = null;
    private buffer = '';
    private authToken: string | null = null;
    private authenticated = false;

    async start(): Promise<void> {
        log('MCP Bridge starting...');

        // Load auth token
        try {
            this.authToken = fs.readFileSync(AUTH_TOKEN_FILE, 'utf8').trim();
            log('Loaded authentication token');
        } catch (err) {
            log(`Failed to load auth token: ${err}`);
            throw new Error('Auth token not found. Please ensure VibeTTY extension is running in VSCode.');
        }

        // Try to connect to VSCode extension
        try {
            log(`Attempting to connect to IPC port ${IPC_PORT}...`);
            await this.connectToExtension();
            log('Successfully connected to VSCode extension');

            // Authenticate
            await this.authenticate();
            log('Successfully authenticated');
        } catch (err) {
            // Connection failed - continue anyway and respond to requests with errors
            const message = err instanceof Error ? err.message : 'Unknown connection error';
            log(`Connection failed: ${message}`);
        }

        log('Setting up stdin/stdout interface');

        // Read from stdin (even if connection failed, we need to respond to MCP requests)
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.on('line', (line) => {
            log(`Received MCP request: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
            this.handleMCPInput(line);
        });

        rl.on('close', () => {
            log('Stdin closed, cleaning up');
            this.cleanup();
        });

        log('Ready to accept MCP requests');
    }

    private connectToExtension(): Promise<void> {
        return new Promise((resolve, reject) => {
            log(`Creating connection to ${IPC_PORT}...`);

            this.ipcClient = net.createConnection(IPC_PORT, '127.0.0.1', () => {
                log('Connection established');
                resolve();
            });

            this.ipcClient.on('data', (data) => {
                log(`Received data from extension: ${data.toString().substring(0, 100)}${data.toString().length > 100 ? '...' : ''}`);
                this.buffer += data.toString();
                this.processBuffer();
            });

            this.ipcClient.on('error', (err) => {
                const errCode = (err as NodeJS.ErrnoException).code;
                log(`Socket error: ${errCode} - ${err.message}`);

                if (errCode === 'ECONNREFUSED') {
                    // Extension not running - reject the promise so initialization fails cleanly
                    reject(new Error('VibeTTY extension not running in VSCode. Please start VSCode with the VibeTTY extension.'));
                } else {
                    reject(err);
                }
            });

            this.ipcClient.on('close', () => {
                log('Socket closed by remote');
                // Connection to VSCode was closed, but don't exit
                // Just mark the client as unavailable
                this.ipcClient = null;
            });
        });
    }

    private processBuffer(): void {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                try {
                    const response = JSON.parse(line);
                    this.handleExtensionResponse(response);
                } catch {
                    // Ignore parse errors from extension
                }
            }
        }
    }

    private authenticate(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.authToken || !this.ipcClient) {
                reject(new Error('No auth token or connection'));
                return;
            }

            // Generate signature
            const signature = crypto
                .createHmac('sha256', this.authToken)
                .update(this.authToken)
                .digest('hex');

            const authRequest = {
                jsonrpc: '2.0',
                id: 'auth',
                method: 'vibetty/authenticate',
                params: {
                    token: this.authToken,
                    signature
                }
            };

            // Set up one-time listener for auth response
            const authHandler = (data: Buffer) => {
                const response = data.toString();
                try {
                    const parsed = JSON.parse(response);
                    if (parsed.id === 'auth') {
                        if (parsed.result?.authenticated) {
                            this.authenticated = true;
                            resolve();
                        } else {
                            reject(new Error('Authentication failed'));
                        }
                    }
                } catch {
                    // Ignore parse errors
                }
            };

            this.ipcClient.once('data', authHandler);

            // Send auth request
            this.ipcClient.write(JSON.stringify(authRequest) + '\n');

            // Timeout after 2 seconds (reduced from 5 for faster failure)
            setTimeout(() => {
                if (!this.authenticated) {
                    this.ipcClient?.removeListener('data', authHandler);
                    reject(new Error('Authentication timeout - VSCode extension may not be responding'));
                }
            }, 2000);
        });
    }

    private handleMCPInput(line: string): void {
        try {
            const request = JSON.parse(line) as JSONRPCRequest;
            log(`Parsed request: method=${request.method}, id=${request.id}`);

            // Check authentication
            if (!this.authenticated) {
                log('Not authenticated - sending error');
                this.sendError(request.id, -32001, 'Not authenticated to VibeTTY extension');
                return;
            }

            // Sign the request
            if (!this.authToken) {
                log('No auth token - sending error');
                this.sendError(request.id, -32000, 'No authentication token');
                return;
            }

            // Add signature to params
            const params = request.params || {};
            const payload = JSON.stringify({
                method: request.method,
                params
            });

            const signature = crypto
                .createHmac('sha256', this.authToken)
                .update(payload)
                .digest('hex');

            const signedRequest = {
                ...request,
                params: {
                    ...params,
                    _signature: signature
                }
            };

            // Forward to extension
            if (this.ipcClient && this.ipcClient.writable) {
                log('Forwarding signed request to extension');
                this.ipcClient.write(JSON.stringify(signedRequest) + '\n');
            } else {
                log('No connection - sending error response');
                this.sendError(request.id, -32000, 'Not connected to VibeTTY extension');
            }
        } catch {
            log('Parse error on input');
            this.sendError(null, -32700, 'Parse error');
        }
    }

    private handleExtensionResponse(response: unknown): void {
        log('Forwarding extension response to MCP client');
        // Forward response to MCP client
        process.stdout.write(JSON.stringify(response) + '\n');
    }

    private sendError(id: number | string | null, code: number, message: string): void {
        const response = {
            jsonrpc: '2.0',
            id,
            error: { code, message }
        };
        process.stdout.write(JSON.stringify(response) + '\n');
    }

    private cleanup(): void {
        if (this.ipcClient) {
            this.ipcClient.destroy();
        }
        process.exit(0);
    }
}

const bridge = new MCPBridge();
bridge.start().catch((err) => {
    log(`Failed to start MCP bridge: ${err}`);
    process.exit(1);
});
