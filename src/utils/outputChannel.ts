/**
 * Centralized output channel for VibeTTY extension logging
 * Replaces console.log/warn/error with VSCode-native logging
 */

import * as vscode from 'vscode';

class OutputChannelManager {
    private static instance: OutputChannelManager;
    private channel: vscode.OutputChannel;

    private constructor() {
        this.channel = vscode.window.createOutputChannel('VibeTTY');
    }

    static getInstance(): OutputChannelManager {
        if (!OutputChannelManager.instance) {
            OutputChannelManager.instance = new OutputChannelManager();
        }
        return OutputChannelManager.instance;
    }

    /**
     * Log an informational message
     */
    info(message: string): void {
        const timestamp = new Date().toISOString();
        this.channel.appendLine(`[${timestamp}] INFO: ${message}`);
    }

    /**
     * Log a warning message
     */
    warn(message: string): void {
        const timestamp = new Date().toISOString();
        this.channel.appendLine(`[${timestamp}] WARN: ${message}`);
    }

    /**
     * Log an error message
     */
    error(message: string, error?: Error): void {
        const timestamp = new Date().toISOString();
        let errorDetails = message;
        if (error) {
            errorDetails += `\n  Error: ${error.message}\n  Stack: ${error.stack}`;
        }
        this.channel.appendLine(`[${timestamp}] ERROR: ${errorDetails}`);
    }

    /**
     * Show the output channel to the user
     */
    show(): void {
        this.channel.show();
    }

    /**
     * Dispose of the output channel
     */
    dispose(): void {
        this.channel.dispose();
    }
}

// Export singleton instance methods for convenience
export const outputChannel = {
    info: (message: string) => OutputChannelManager.getInstance().info(message),
    warn: (message: string) => OutputChannelManager.getInstance().warn(message),
    error: (message: string, error?: Error) => OutputChannelManager.getInstance().error(message, error),
    show: () => OutputChannelManager.getInstance().show(),
    dispose: () => OutputChannelManager.getInstance().dispose()
};
