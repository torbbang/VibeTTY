import { Vendor, SecretPattern } from './vendor';
import { genericVendor } from './generic';

const junosSecretPatterns: SecretPattern[] = [
    // Junos secret (Type 5 hash)
    {
        pattern: /secret\s+5\s+(\$1\$.*)/gi,
        context: 'secret (Type 5)',
        captureGroup: 1
    },
    // Junos secret (Type 4, 8, 9)
    {
        pattern: /secret\s+[489]\s+([a-zA-Z0-9$./]+)/gi,
        context: 'secret (Type 4/8/9)',
        captureGroup: 1
    },
    // Junos encrypted password
    {
        pattern: /password\s+encrypted\s+"([^"]+)"/gi,
        context: 'encrypted password',
        captureGroup: 1
    },
    // Junos plain-text password (less common, but exists)
    {
        pattern: /plain-text-password\s+"([^"]+)"/gi,
        context: 'plain-text password',
        captureGroup: 1
    },
    // SNMP community strings
    {
        pattern: /community\s+([^\s{]+)\s+(?:authorization|clients)/gi,
        context: 'SNMP community',
        captureGroup: 1
    },
    // SNMP v3 authentication key
    {
        pattern: /authentication-(?:md5|sha)\s+([^\s;]+)/gi,
        context: 'SNMP v3 auth key',
        captureGroup: 1
    },
    // SNMP v3 privacy key
    {
        pattern: /privacy-(?:des|3des|aes128)\s+([^\s;]+)/gi,
        context: 'SNMP v3 privacy key',
        captureGroup: 1
    },
    // TACACS+ server secret
    {
        pattern: /secret\s+"([^"]+)"/gi,
        context: 'TACACS+ secret',
        captureGroup: 1
    },
    // RADIUS server secret
    {
        pattern: /radius-server\s+\S+\s+secret\s+"([^"]+)"/gi,
        context: 'RADIUS secret',
        captureGroup: 1
    },
    // BGP MD5 authentication
    {
        pattern: /authentication-key\s+"([^"]+)"/gi,
        context: 'BGP authentication key',
        captureGroup: 1
    },
    // IPsec pre-shared key
    {
        pattern: /pre-shared-key\s+(?:ascii-text|hexadecimal)\s+"([^"]+)"/gi,
        context: 'IPsec pre-shared key',
        captureGroup: 1
    },
    // SSH private key (rare in config, but possible)
    {
        pattern: /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/gi,
        context: 'SSH private key',
        captureGroup: 1
    }
];

const junosPasswordPromptPatterns: string[] = [];

const junosSubSessionFailurePatterns: RegExp[] = [
    /ssh: Could not resolve hostname/i,
];

export const junosVendor: Vendor = {
    name: 'juniper',
    passwordPromptPatterns: [...genericVendor.passwordPromptPatterns, ...junosPasswordPromptPatterns],
    paginationPromptPatterns: ['---\(more\)---'],
    promptPatterns: [
        // Matches user@host> or user@host#
        /^[a-zA-Z0-9-_.()]+@[a-zA-Z0-9-_.()]+[>#]\s*$/
    ],
    secretPatterns: [...genericVendor.secretPatterns, ...junosSecretPatterns],
    subSessionCommandPatterns: genericVendor.subSessionCommandPatterns,
    subSessionSuccessPatterns: genericVendor.subSessionSuccessPatterns,
    subSessionFailurePatterns: [...(genericVendor.subSessionFailurePatterns || []), ...junosSubSessionFailurePatterns]
};
