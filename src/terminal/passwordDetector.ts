/**
 * Password Detector Module
 * Detects password prompts and manages visual feedback
 */

import * as vscode from 'vscode';
import { Vendor } from '../device-types';

export class PasswordDetector {
    private passwordPromptLine = '';
    private isBlinking = false;
    private promptDetectionTimer?: NodeJS.Timeout;
    private blinkInterval?: NodeJS.Timeout;
    private writeEmitter?: vscode.EventEmitter<string>;

    constructor(writeEmitter?: vscode.EventEmitter<string>) {
        this.writeEmitter = writeEmitter;
    }

    /**
     * Detect password prompt in output data
     */
    detectPasswordPrompt(data: string, vendor: Vendor, terminal?: vscode.Terminal): void {
        // Clear existing timer
        if (this.promptDetectionTimer) {
            clearTimeout(this.promptDetectionTimer);
        }

        // Accumulate data that might be a password prompt
        this.passwordPromptLine += data;

        // Limit line length to prevent memory issues
        if (this.passwordPromptLine.length > 500) {
            this.passwordPromptLine = this.passwordPromptLine.slice(-500);
        }

        // Check if this looks like a password prompt
        const isPasswordPrompt = vendor.passwordPromptPatterns.some(pattern => {
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
            return regex.test(this.passwordPromptLine);
        });

        if (isPasswordPrompt) {
            // Delay to avoid false positives from partial data
            this.promptDetectionTimer = setTimeout(() => {
                // Start visual feedback
                this.startBlinking();

                // Bring terminal to focus
                if (terminal) {
                    terminal.show(false); // Show but don't take focus from editor
                }

                // Clear the line buffer
                this.passwordPromptLine = '';
            }, 300);
        }

        // Reset line buffer on newline
        if (data.includes('\n')) {
            this.passwordPromptLine = '';
        }
    }

    /**
     * Start blinking visual feedback
     */
    private startBlinking(): void {
        if (this.isBlinking || !this.writeEmitter) {
            return;
        }

        this.isBlinking = true;
        let isVisible = true;

        this.blinkInterval = setInterval(() => {
            if (isVisible) {
                this.writeEmitter?.fire('\x1b[32m█\x1b[0m'); // Green block
            } else {
                this.writeEmitter?.fire('\x1b[2K\r'); // Clear line
            }
            isVisible = !isVisible;
        }, 500);
    }

    /**
     * Stop blinking visual feedback
     */
    stopBlinking(): void {
        if (!this.isBlinking) {
            return;
        }

        this.isBlinking = false;
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval);
            this.blinkInterval = undefined;
        }

        // Clear any remaining blink character
        if (this.writeEmitter) {
            this.writeEmitter.fire('\x1b[2K\r');
        }
    }

    /**
     * Clean up timers
     */
    cleanup(): void {
        if (this.promptDetectionTimer) {
            clearTimeout(this.promptDetectionTimer);
            this.promptDetectionTimer = undefined;
        }
        this.stopBlinking();
    }

    /**
     * Check if currently blinking
     */
    isCurrentlyBlinking(): boolean {
        return this.isBlinking;
    }
}
