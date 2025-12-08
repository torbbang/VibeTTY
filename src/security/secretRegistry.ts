/**
 * Secret Registry - Tracks detected secrets and provides placeholders
 *
 * Flow:
 * 1. Detect secret in terminal output (password, enable secret, SNMP community)
 * 2. Store encrypted in registry, return placeholder
 * 3. LLM sees placeholder in output: <REDACTED_SECRET_1>
 * 4. LLM can reference placeholder in commands
 * 5. Before sending command, substitute placeholder with actual secret
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';

export interface SecretEntry {
    id: string;                    // "SECRET_1", "SECRET_2"
    placeholder: string;           // "<REDACTED_SECRET_1>"
    encryptedValue: string;        // AES-256 encrypted
    context: string;               // "enable secret", "SNMP community", etc.
    sessionId: string;             // Which session it came from
    timestamp: Date;
    deviceHost?: string;
}

/**
 * Singleton registry for managing detected secrets
 */
export class SecretRegistry {
    private static instance: SecretRegistry;
    private secrets: Map<string, SecretEntry> = new Map();
    private secretCounter = 0;

    // Encryption key (derived from machine ID for persistence across restarts)
    private encryptionKey: Buffer;

    private constructor() {
        // Derive encryption key from VSCode machine ID
        // This ensures secrets can be decrypted across extension restarts
        const machineId = vscode.env.machineId;
        this.encryptionKey = crypto.createHash('sha256').update(machineId).digest();
    }

    static getInstance(): SecretRegistry {
        if (!SecretRegistry.instance) {
            SecretRegistry.instance = new SecretRegistry();
        }
        return SecretRegistry.instance;
    }

    /**
     * Register a new secret, returns placeholder for LLM
     */
    registerSecret(
        plaintext: string,
        context: string,
        sessionId: string,
        deviceHost?: string
    ): string {
        // Check if already registered
        for (const entry of this.secrets.values()) {
            const decrypted = this.decrypt(entry.encryptedValue);
            if (decrypted === plaintext) {
                return entry.placeholder;
            }
        }

        // Create new secret entry
        this.secretCounter++;
        const id = `SECRET_${this.secretCounter}`;
        const placeholder = `<REDACTED_${id}>`;

        const entry: SecretEntry = {
            id,
            placeholder,
            encryptedValue: this.encrypt(plaintext),
            context,
            sessionId,
            timestamp: new Date(),
            deviceHost
        };

        this.secrets.set(id, entry);
        return placeholder;
    }

    /**
     * Replace all secrets in text with placeholders (for LLM output)
     */
    redactSecrets(text: string): string {
        let redacted = text;

        for (const entry of this.secrets.values()) {
            const plaintext = this.decrypt(entry.encryptedValue);
            // Escape special regex characters
            const escapedSecret = plaintext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            redacted = redacted.replace(new RegExp(escapedSecret, 'g'), entry.placeholder);
        }

        return redacted;
    }

    /**
     * Replace placeholders with actual secrets (for command execution)
     */
    restoreSecrets(text: string): string {
        let restored = text;

        for (const entry of this.secrets.values()) {
            const plaintext = this.decrypt(entry.encryptedValue);
            restored = restored.replace(new RegExp(entry.placeholder, 'g'), plaintext);
        }

        return restored;
    }

    /**
     * Get list of registered secrets (for debugging)
     */
    listSecrets(): SecretEntry[] {
        return Array.from(this.secrets.values()).map(entry => ({
            ...entry,
            encryptedValue: '***' // Don't expose encrypted value
        }));
    }

    /**
     * Clear all secrets for a session
     */
    clearSession(sessionId: string): void {
        for (const [id, entry] of this.secrets) {
            if (entry.sessionId === sessionId) {
                this.secrets.delete(id);
            }
        }
    }

    /**
     * Encrypt plaintext secret
     */
    private encrypt(plaintext: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Prepend IV for decryption
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt encrypted secret
     */
    private decrypt(encrypted: string): string {
        const [ivHex, ciphertext] = encrypted.split(':');
        const iv = Buffer.from(ivHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
