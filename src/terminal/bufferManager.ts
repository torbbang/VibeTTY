/**
 * Buffer Manager Module
 * Manages terminal output buffer with size limits and trimming
 */

export class BufferManager {
    private static readonly MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10MB hard limit
    private static readonly DEFAULT_SCROLLBACK_LINES = 5000;

    private outputBuffer = '';
    private lastReadPosition = 0;
    private maxScrollbackLines: number;

    constructor(maxScrollbackLines?: number) {
        this.maxScrollbackLines = maxScrollbackLines || BufferManager.DEFAULT_SCROLLBACK_LINES;

        // Ensure a reasonable minimum
        if (this.maxScrollbackLines < 100) {
            this.maxScrollbackLines = 100;
        }
    }

    /**
     * Append data to the output buffer
     */
    append(data: string): void {
        this.outputBuffer += data;
        this.trimBuffer();
    }

    /**
     * Get the entire buffer
     */
    getBuffer(): string {
        return this.outputBuffer;
    }

    /**
     * Get recent output lines
     */
    getRecentOutput(lines?: number): string {
        if (!lines) {
            return this.outputBuffer;
        }

        const allLines = this.outputBuffer.split('\n');
        const recentLines = allLines.slice(-lines);
        return recentLines.join('\n');
    }

    /**
     * Peek at recent output without updating read position
     */
    peekRecentOutput(): string {
        return this.outputBuffer.slice(this.lastReadPosition);
    }

    /**
     * Get new output since last read and update read position
     */
    readNewOutput(): string {
        const newOutput = this.outputBuffer.slice(this.lastReadPosition);
        this.lastReadPosition = this.outputBuffer.length;
        return newOutput;
    }

    /**
     * Clear the buffer
     */
    clear(): void {
        this.outputBuffer = '';
        this.lastReadPosition = 0;
    }

    /**
     * Trim buffer to stay within size and line limits
     * Uses binary search algorithm for efficient trimming
     */
    private trimBuffer(): void {
        // First check byte limit
        if (this.outputBuffer.length > BufferManager.MAX_BUFFER_BYTES) {
            const targetSize = Math.floor(BufferManager.MAX_BUFFER_BYTES * 0.8);
            const trimAmount = this.outputBuffer.length - targetSize;
            this.outputBuffer = this.outputBuffer.slice(trimAmount);
            this.lastReadPosition = Math.max(0, this.lastReadPosition - trimAmount);
        }

        // Then check line limit
        const lines = this.outputBuffer.split('\n');
        if (lines.length > this.maxScrollbackLines) {
            const linesToKeep = Math.floor(this.maxScrollbackLines * 0.8);
            const trimmedLines = lines.slice(-linesToKeep);
            const newBuffer = trimmedLines.join('\n');

            // Adjust last read position
            const bytesRemoved = this.outputBuffer.length - newBuffer.length;
            this.lastReadPosition = Math.max(0, this.lastReadPosition - bytesRemoved);
            this.outputBuffer = newBuffer;
        }
    }

    /**
     * Get buffer statistics
     */
    getStats(): { bytes: number; lines: number; unreadBytes: number } {
        const lines = this.outputBuffer.split('\n').length;
        const bytes = this.outputBuffer.length;
        const unreadBytes = bytes - this.lastReadPosition;

        return { bytes, lines, unreadBytes };
    }
}
