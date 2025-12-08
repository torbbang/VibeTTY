import { Vendor, SecretPattern } from './vendor';

const genericSecretPatterns: SecretPattern[] = [
    // SNMP community string
    {
        pattern: /snmp-server\s+community\s+(\S+)/gi,
        context: 'SNMP community',
        captureGroup: 1
    },
    // BGP neighbor password
    {
        pattern: /neighbor\s+\S+\s+password\s+(\S+)/gi,
        context: 'BGP password',
        captureGroup: 1
    },
    // OSPF authentication key
    {
        pattern: /ip\s+ospf\s+authentication-key\s+(\S+)/gi,
        context: 'OSPF key',
        captureGroup: 1
    },
    // TACACS/RADIUS key
    {
        pattern: /(?:tacacs-server|radius-server)\s+key\s+(\S+)/gi,
        context: 'AAA key',
        captureGroup: 1
    },
    // Pre-shared keys (IPSec, etc.)
    {
        pattern: /pre-shared-key\s+(?:local|remote)?\s*(\S+)/gi,
        context: 'pre-shared key',
        captureGroup: 1
    },
    // WPA/WPA2 keys
    {
        pattern: /wpa-psk\s+(?:ascii|hex)?\s*(\S+)/gi,
        context: 'WPA key',
        captureGroup: 1
    },
    // Linux-style password hashes ($id$salt$hash)
    {
        pattern: /(\$[1569y]\$[a-zA-Z0-9./]{1,16}\$[a-zA-Z0-9./]{22,})/gi,
        context: 'password hash',
        captureGroup: 1
    },
    // PEM-formatted private keys (RSA, DSA, EC, etc.)
    {
        pattern: /(-----BEGIN (?:RSA |DSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |ENCRYPTED )?PRIVATE KEY-----)/gi,
        context: 'private key',
        captureGroup: 1
    },
    // PEM-formatted certificates
    {
        pattern: /(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/gi,
        context: 'certificate',
        captureGroup: 1
    },
    // SSH public keys
    {
        pattern: /(ssh-(?:rsa|dss|ed25519|ecdsa-sha2-nistp(?:256|384|521))\s+[A-Za-z0-9+/=]+)/gi,
        context: 'SSH public key',
        captureGroup: 1
    }
];

const genericPasswordPromptPatterns: string[] = [
    'password:',
    'password for',
    'enter password',
    'sudo password',
    '[sudo]',
    'passphrase',
    'password required',
    'password authentication',
    'password: '
];

const genericSubSessionSuccessPatterns: RegExp[] = [
    // Successful subsession means we got a device/shell prompt (not just a password prompt)
    // Typical prompts: hostname>, hostname#, user@host$, user@host:~$, etc.
    // Match prompts that appear anywhere in the data (not just line-anchored)
    /\S+[>#$]\s*$/m,
    /\S+@\S+[:#$~]\s*$/m,
    /[A-Za-z0-9_-]+\(config[^\)]*\)[>#]\s*$/m
];

const genericSubSessionFailurePatterns: RegExp[] = [
    /Connection refused/i,
    /Connection timed out/i,
    /No route to host/i,
    /Host unreachable/i,
    /Permission denied/i,
    /Authentication failed/i,
    /Unknown host/i,
    /could not resolve hostname/i,
];

export const genericVendor: Vendor = {
    name: 'generic',
    passwordPromptPatterns: genericPasswordPromptPatterns,
    paginationPromptPatterns: [],
    promptPatterns: [
        // Generic prompt: ends in >, #, or $
        /[>#$]\s*$/
    ],
    secretPatterns: genericSecretPatterns,
    subSessionCommandPatterns: [
        // SSH/Telnet with hostname or IP (handles various formats)
        /^(ssh|telnet)\s+([^\s@]+@)?([^\s]+)/,  // Captures user@host or just host in group 3
        // SSH with -l user option
        /^ssh\s+-l\s+\S+\s+([^\s]+)/,
        // Telnet with port
        /^telnet\s+([^\s]+)\s+\d+/
    ],
    subSessionSuccessPatterns: genericSubSessionSuccessPatterns,
    subSessionFailurePatterns: genericSubSessionFailurePatterns
};
