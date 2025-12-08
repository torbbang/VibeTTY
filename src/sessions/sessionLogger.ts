import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { outputChannel } from '../utils/outputChannel';

/**
 * Session logger that writes terminal output to disk
 * Features:
 * - Daily log rotation at midnight UTC
 * - Timestamped events (connect, disconnect, commands)
 * - Concurrent session support
 * - No secret redaction (raw output)
 */
export class SessionLogger {
    private logStream?: fs.WriteStream;
    private currentLogFile?: string;
    private sessionId: string;
    private hostName: string;
    private logDirectory: string;
    private connectTime?: Date;
    private rotationTimer?: NodeJS.Timeout;

    constructor(sessionId: string, hostName: string, logDirectory?: string) {
        this.sessionId = sessionId;
        this.hostName = hostName;

        // Use configured directory or default to ~/.vibetty/logs
        this.logDirectory = logDirectory || path.join(os.homedir(), '.vibetty', 'logs');

        // Ensure log directory exists
        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory, { recursive: true });
        }
    }

    /**
     * Start logging - creates/opens log file and schedules rotation
     */
    start(): void {
        this.connectTime = new Date();
        this.openLogFile();
        this.scheduleNextRotation();

        // Write session start marker
        this.writeEvent('SESSION_START', `Connected to ${this.hostName} (Session ID: ${this.sessionId})`);
    }

    /**
     * Stop logging - writes disconnect event and closes file
     */
    stop(): void {
        if (this.rotationTimer) {
            clearTimeout(this.rotationTimer);
            this.rotationTimer = undefined;
        }

        const disconnectTime = new Date();
        const duration = this.connectTime
            ? Math.round((disconnectTime.getTime() - this.connectTime.getTime()) / 1000)
            : 0;

        this.writeEvent('SESSION_END', `Disconnected from ${this.hostName} (Duration: ${duration}s)`);

        if (this.logStream) {
            this.logStream.end();
            this.logStream = undefined;
        }
    }

    /**
     * Write terminal output to log file
     */
    write(data: string): void {
        if (!this.logStream) {
            return;
        }

        // Check if we need to rotate (crossed midnight UTC)
        if (this.shouldRotate()) {
            this.rotate();
        }

        // Write data without timestamp (terminal output is continuous)
        this.logStream.write(data);
    }

    /**
     * Write a timestamped event (connect, disconnect, command, etc.)
     */
    writeEvent(eventType: string, message: string): void {
        if (!this.logStream) {
            return;
        }

        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] [${eventType}] ${message}\n`;
        this.logStream.write(line);
    }

    /**
     * Write a command with timestamp
     */
    writeCommand(command: string): void {
        this.writeEvent('COMMAND', command);
    }

    /**
     * Get current log file path
     */
    getLogFilePath(): string | undefined {
        return this.currentLogFile;
    }

    /**
     * Open or create log file for current date
     */
    private openLogFile(): void {
        // Close existing stream if open
        if (this.logStream) {
            this.logStream.end();
        }

        // Generate filename: hostname-YYYY-MM-DD-sessionId.log
        const date = this.getUTCDateString();
        const sanitizedHostName = this.hostName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const sanitizedSessionId = this.sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${sanitizedHostName}-${date}-${sanitizedSessionId}.log`;

        this.currentLogFile = path.join(this.logDirectory, filename);

        // Open file in append mode with secure permissions (0600 = rw-------)
        // This prevents other users from reading potentially sensitive terminal output
        this.logStream = fs.createWriteStream(this.currentLogFile, {
            flags: 'a',
            mode: 0o600  // Owner read/write only
        });

        // Handle errors
        this.logStream.on('error', (err) => {
            outputChannel.error(`Log file error: ${err.message}`, err);
            vscode.window.showErrorMessage(`Failed to write to log file: ${err.message}`);
        });
    }

    /**
     * Check if we should rotate to a new log file (crossed midnight UTC)
     */
    private shouldRotate(): boolean {
        if (!this.currentLogFile) {
            return false;
        }

        const currentDate = this.getUTCDateString();
        return !this.currentLogFile.includes(currentDate);
    }

    /**
     * Rotate to a new log file
     */
    private rotate(): void {
        this.writeEvent('LOG_ROTATE', 'Rotating to new log file at midnight UTC');
        this.openLogFile();
        this.writeEvent('LOG_ROTATE', 'New log file started');
        this.scheduleNextRotation();
    }

    /**
     * Schedule next rotation at midnight UTC
     */
    private scheduleNextRotation(): void {
        if (this.rotationTimer) {
            clearTimeout(this.rotationTimer);
        }

        const now = new Date();
        const nextMidnight = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            0, 0, 0, 0
        ));

        const msUntilMidnight = nextMidnight.getTime() - now.getTime();

        this.rotationTimer = setTimeout(() => {
            this.rotate();
        }, msUntilMidnight);
    }

    /**
     * Get current UTC date as YYYY-MM-DD string
     */
    private getUTCDateString(): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
