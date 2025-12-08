/**
 * Pagination Handler Module
 * Manages automatic pagination for MCP commands
 */

import { Vendor } from '../device-types';

interface QueuedCommand {
    text: string;
    addNewLine: boolean;
}

export class PaginationHandler {
    private paginationBuffer = '';
    private isPaginating = false;
    private commandQueue: QueuedCommand[] = [];
    private autoPaginateEnabled = false;

    /**
     * Enable auto-pagination (typically for MCP commands)
     */
    enableAutoPagination(): void {
        this.autoPaginateEnabled = true;
    }

    /**
     * Disable auto-pagination
     */
    disableAutoPagination(): void {
        this.autoPaginateEnabled = false;
    }

    /**
     * Check if currently paginating
     */
    isPaginationActive(): boolean {
        return this.isPaginating;
    }

    /**
     * Queue a command to be sent after pagination completes
     */
    queueCommand(text: string, addNewLine: boolean): void {
        this.commandQueue.push({ text, addNewLine });
    }

    /**
     * Get queued commands and clear the queue
     */
    getQueuedCommands(): QueuedCommand[] {
        const commands = [...this.commandQueue];
        this.commandQueue = [];
        return commands;
    }

    /**
     * Detect pagination prompt in output
     * Returns true if pagination should be handled automatically
     */
    detectAndHandlePagination(text: string, vendor: Vendor, devicePromptPattern?: RegExp): boolean {
        if (!this.autoPaginateEnabled) {
            return false;
        }

        // Append to pagination buffer
        this.paginationBuffer += text;

        // Check for device prompt (indicates pagination ended)
        if (devicePromptPattern && devicePromptPattern.test(this.paginationBuffer)) {
            this.isPaginating = false;
            this.paginationBuffer = '';
            return false; // Pagination complete, don't send space
        }

        // Check for vendor-specific pagination prompts
        for (const pattern of vendor.paginationPromptPatterns) {
            if (this.paginationBuffer.includes(pattern)) {
                this.isPaginating = true;
                return true; // Should send space to continue
            }
        }

        // Limit buffer size
        if (this.paginationBuffer.length > 500) {
            this.paginationBuffer = this.paginationBuffer.slice(-500);
        }

        return false;
    }

    /**
     * Remove pagination prompts from output text
     */
    removePaginationPrompts(output: string, vendor: Vendor): string {
        let cleaned = output;
        for (const pattern of vendor.paginationPromptPatterns) {
            cleaned = cleaned.replace(new RegExp(pattern, 'g'), '');
        }
        return cleaned;
    }

    /**
     * Reset pagination state
     */
    reset(): void {
        this.paginationBuffer = '';
        this.isPaginating = false;
        this.autoPaginateEnabled = false;
        this.commandQueue = [];
    }
}
