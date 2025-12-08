/**
 * SSH Configuration Validator
 * Prevents command injection in SSH arguments
 */

// Dangerous shell metacharacters that could enable command injection
const DANGEROUS_CHARS = /[;&|`$()<>{}[\]\\'"!]/;

/**
 * Validate port forwarding string
 * Expected formats:
 *   Local/Remote: [bind:]port:host:hostport
 *   Dynamic: [bind:]port
 */
export function validatePortForward(value: string): string | null {
    if (!value?.trim()) { return 'Port forward cannot be empty'; }
    if (DANGEROUS_CHARS.test(value)) { return 'Contains invalid characters'; }

    const parts = value.split(':');
    for (const part of parts) {
        // Check if it's supposed to be a port
        if (/^\d+$/.test(part)) {
            const port = parseInt(part, 10);
            if (port < 1 || port > 65535) { return `Invalid port: ${port}`; }
        }
    }

    return null; // Valid
}

/**
 * Validate ProxyJump string
 * Expected format: [user@]host[:port][,[user@]host[:port]]...
 */
export function validateProxyJump(value: string): string | null {
    if (!value?.trim()) { return 'ProxyJump cannot be empty'; }
    if (DANGEROUS_CHARS.test(value)) { return 'Contains invalid characters'; }
    return null; // Valid
}

/**
 * Validate ProxyCommand
 * Shell-executed, so very restrictive
 */
export function validateProxyCommand(value: string): string | null {
    if (!value?.trim()) { return 'ProxyCommand cannot be empty'; }
    if (DANGEROUS_CHARS.test(value)) { return 'Contains invalid shell characters'; }
    return null; // Valid
}
