import * as net from 'net';
import * as crypto from 'crypto';

interface JSONRPCRequest {
    jsonrpc: string;
    id: string | number | null;
    method: string;
    params?: Record<string, unknown>;
}
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MCPServer } from './server';

const IPC_PORT = 47632;
const MAX_CLIENTS = 5;
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX_REQUESTS = 20; // Reduced from 100 for security
const AUTH_TOKEN_FILE = path.join(os.homedir(), '.vibetty', 'mcp_token');

interface ClientState {
    socket: net.Socket;
    requestCount: number;
    windowStart: number;
    authenticated: boolean;
}

export class IPCServer {
    private server: net.Server;
    private mcpServer: MCPServer;
    private clients: Map<net.Socket, ClientState> = new Map();
    private authToken: string;

    constructor(mcpServer: MCPServer) {
        this.mcpServer = mcpServer;
        this.authToken = this.getOrCreateAuthToken();
        this.server = net.createServer((socket) => this.handleConnection(socket));
    }

    /**
     * Get or create authentication token
     * Token is stored in ~/.vibetty/mcp_token with 0600 permissions
     */
    private getOrCreateAuthToken(): string {
        const tokenDir = path.dirname(AUTH_TOKEN_FILE);

        try {
            // Ensure directory exists
            if (!fs.existsSync(tokenDir)) {
                fs.mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
            }

            // Check if token file exists
            if (fs.existsSync(AUTH_TOKEN_FILE)) {
                const token = fs.readFileSync(AUTH_TOKEN_FILE, 'utf8').trim();
                if (token.length === 64) { // 32 bytes hex = 64 chars
                    return token;
                }
            }

            // Generate new token
            const token = crypto.randomBytes(32).toString('hex');
            fs.writeFileSync(AUTH_TOKEN_FILE, token, { mode: 0o600 });
            return token;
        } catch {
            // Fallback to ephemeral token if file operations fail
            return crypto.randomBytes(32).toString('hex');
        }
    }

    /**
     * Get the current auth token (for displaying to user)
     */
    getAuthToken(): string {
        return this.authToken;
    }

    /**
     * Get the auth token file path (for displaying to user)
     */
    getAuthTokenPath(): string {
        return AUTH_TOKEN_FILE;
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.on('error', (err) => {
                if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
                    // Port in use, try to close existing and retry
                    reject(new Error(`Port ${IPC_PORT} already in use`));
                } else {
                    reject(err);
                }
            });

            this.server.listen(IPC_PORT, '127.0.0.1', () => {
                resolve();
            });
        });
    }

    stop(): void {
        for (const state of this.clients.values()) {
            state.socket.destroy();
        }
        this.clients.clear();
        this.server.close();
    }

    private handleConnection(socket: net.Socket): void {
        // Enforce max clients
        if (this.clients.size >= MAX_CLIENTS) {
            socket.destroy();
            return;
        }

        // Only allow localhost connections
        const remoteAddress = socket.remoteAddress;
        if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1' && remoteAddress !== '::ffff:127.0.0.1') {
            socket.destroy();
            return;
        }

        const clientState: ClientState = {
            socket,
            requestCount: 0,
            windowStart: Date.now(),
            authenticated: false
        };
        this.clients.set(socket, clientState);

        let buffer = '';

        socket.on('data', (data) => {
            buffer += data.toString();

            // Enforce max request size
            if (buffer.length > MAX_REQUEST_SIZE) {
                socket.destroy();
                this.clients.delete(socket);
                return;
            }

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    if (!this.checkRateLimit(clientState)) {
                        // Rate limit exceeded, reject request
                        const errorResponse = {
                            jsonrpc: '2.0',
                            id: null,
                            error: {
                                code: -32000,
                                message: 'Rate limit exceeded'
                            }
                        };
                        socket.write(JSON.stringify(errorResponse) + '\n');
                        continue;
                    }
                    this.handleRequest(socket, line);
                }
            }
        });

        socket.on('close', () => {
            this.clients.delete(socket);
        });

        socket.on('error', () => {
            this.clients.delete(socket);
        });
    }

    private checkRateLimit(clientState: ClientState): boolean {
        const now = Date.now();

        // Reset window if expired
        if (now - clientState.windowStart >= RATE_LIMIT_WINDOW) {
            clientState.requestCount = 0;
            clientState.windowStart = now;
        }

        clientState.requestCount++;

        return clientState.requestCount <= RATE_LIMIT_MAX_REQUESTS;
    }

    private async handleRequest(socket: net.Socket, line: string): Promise<void> {
        try {
            const request = JSON.parse(line);
            const clientState = this.clients.get(socket);

            if (!clientState) {
                socket.destroy();
                return;
            }

            // Check for authentication request
            if (request.method === 'vibetty/authenticate') {
                this.handleAuthentication(socket, clientState, request);
                return;
            }

            // All other requests require authentication
            if (!clientState.authenticated) {
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: request.id || null,
                    error: {
                        code: -32001,
                        message: 'Not authenticated. Send vibetty/authenticate request first.'
                    }
                };
                socket.write(JSON.stringify(errorResponse) + '\n');
                return;
            }

            // Verify request signature
            if (!this.verifySignature(request)) {
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: request.id || null,
                    error: {
                        code: -32002,
                        message: 'Invalid request signature'
                    }
                };
                socket.write(JSON.stringify(errorResponse) + '\n');
                return;
            }

            const response = await this.mcpServer.handleRequest(request);
            // Only send response if one was returned (null means notification, no response needed)
            if (response !== null) {
                socket.write(JSON.stringify(response) + '\n');
            }
        } catch {
            const errorResponse = {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: 'Parse error'
                }
            };
            socket.write(JSON.stringify(errorResponse) + '\n');
        }
    }

    /**
     * Handle authentication request
     * Client sends: { method: 'vibetty/authenticate', params: { token: 'xxx', signature: 'xxx' } }
     */
    private handleAuthentication(socket: net.Socket, clientState: ClientState, request: JSONRPCRequest): void {
        const token = request.params?.token;
        const signature = request.params?.signature;

        // Verify token
        if (token !== this.authToken) {
            const errorResponse = {
                jsonrpc: '2.0',
                id: request.id || null,
                error: {
                    code: -32003,
                    message: 'Invalid authentication token'
                }
            };
            socket.write(JSON.stringify(errorResponse) + '\n');
            return;
        }

        // Verify signature (HMAC of token)
        const expectedSignature = crypto
            .createHmac('sha256', this.authToken)
            .update(token)
            .digest('hex');

        if (signature !== expectedSignature) {
            const errorResponse = {
                jsonrpc: '2.0',
                id: request.id || null,
                error: {
                    code: -32004,
                    message: 'Invalid signature'
                }
            };
            socket.write(JSON.stringify(errorResponse) + '\n');
            return;
        }

        // Authentication successful
        clientState.authenticated = true;
        const successResponse = {
            jsonrpc: '2.0',
            id: request.id || null,
            result: { authenticated: true }
        };
        socket.write(JSON.stringify(successResponse) + '\n');
    }

    /**
     * Verify HMAC signature of request
     * Signature should be in request.params._signature
     */
    private verifySignature(request: JSONRPCRequest): boolean {
        const signature = request.params?._signature;
        if (!signature) {
            return false;
        }

        // Create a copy without the signature field
        const paramsWithoutSig = { ...request.params };
        delete paramsWithoutSig._signature;

        const payload = JSON.stringify({
            method: request.method,
            params: paramsWithoutSig
        });

        const expectedSignature = crypto
            .createHmac('sha256', this.authToken)
            .update(payload)
            .digest('hex');

        return signature === expectedSignature;
    }
}
