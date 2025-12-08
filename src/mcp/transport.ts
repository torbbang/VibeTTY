import { MCPServer } from './server';

// Handles stdio-based MCP transport
export class StdioTransport {
    private server: MCPServer;
    private buffer = '';

    constructor(server: MCPServer) {
        this.server = server;
    }

    start(): void {
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk: string) => {
            this.buffer += chunk;
            this.processBuffer();
        });

        process.stdin.on('end', () => {
            process.exit(0);
        });
    }

    private processBuffer(): void {
        // MCP uses newline-delimited JSON
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim()) {
                void this.handleLine(line);
            }
        }
    }

    private async handleLine(line: string): Promise<void> {
        try {
            const request = JSON.parse(line);
            const response = await this.server.handleRequest(request);
            // Only send response if one was returned (null means notification, no response needed)
            if (response !== null) {
                this.send(response);
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
            this.send(errorResponse);
        }
    }

    private send(message: object): void {
        const json = JSON.stringify(message);
        process.stdout.write(json + '\n');
    }
}
