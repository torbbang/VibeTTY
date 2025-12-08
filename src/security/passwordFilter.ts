/**
 * Password Filter - Detects and redacts secrets from terminal output
 *
 * Detects:
 * - Cisco IOS passwords: enable secret 5 <hash>, username X password <pass>
 * - SNMP community strings: snmp-server community <string>
 * - BGP/OSPF passwords: neighbor X password <pass>
 * - TACACS/RADIUS keys: tacacs-server key <key>
 * - Password hashes: MD5/SHA256 hashes in configs
 */

import { SecretRegistry } from './secretRegistry';
import { SecretPattern } from '../device-types/vendor';

export interface FilterOptions {
    sessionId: string;
    deviceHost?: string;
    secretPatterns: SecretPattern[];
}

export class PasswordFilter {
    private static instance: PasswordFilter;
    private secretRegistry = SecretRegistry.getInstance();

    private constructor() {}

    static getInstance(): PasswordFilter {
        if (!PasswordFilter.instance) {
            PasswordFilter.instance = new PasswordFilter();
        }
        return PasswordFilter.instance;
    }

    /**
     * Filter output - detect secrets and replace with placeholders
     * This is what LLM sees
     */
    filterOutput(text: string, options: FilterOptions): string {
        let filtered = text;

        // Detect and register new secrets
        for (const secretPattern of options.secretPatterns) {
            const matches = Array.from(text.matchAll(secretPattern.pattern));

            for (const match of matches) {
                const secretValue = match[secretPattern.captureGroup];

                // Skip if looks like a placeholder already
                if (secretValue.includes('REDACTED') || secretValue.includes('<removed>')) {
                    continue;
                }

                // Register secret and get placeholder
                const placeholder = this.secretRegistry.registerSecret(
                    secretValue,
                    secretPattern.context,
                    options.sessionId,
                    options.deviceHost
                );

                // Replace in text
                filtered = filtered.replace(secretValue, placeholder);
            }
        }

        // Also apply generic redaction for existing registered secrets
        filtered = this.secretRegistry.redactSecrets(filtered);

        return filtered;
    }

    /**
     * Restore placeholders to actual secrets before command execution
     * Used when LLM writes command with placeholders
     */
    restoreSecrets(text: string): string {
        return this.secretRegistry.restoreSecrets(text);
    }

    /**
     * Clear secrets for a session
     */
    clearSession(sessionId: string): void {
        this.secretRegistry.clearSession(sessionId);
    }

    /**
     * Get registered secrets (for debugging)
     */
    getSecrets() {
        return this.secretRegistry.listSecrets();
    }
}
