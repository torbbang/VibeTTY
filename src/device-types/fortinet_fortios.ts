import { Vendor, SecretPattern } from './vendor';
import { genericVendor } from './generic';

const fortiosSecretPatterns: SecretPattern[] = [
    // FortiOS encrypted password
    {
        pattern: /set\s+password\s+(ENC\s+\S+)/gi,
        context: 'encrypted password',
        captureGroup: 1
    },
    // FortiOS private key (multiple formats)
    {
        pattern: /(-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----)/gi,
        context: 'private key',
        captureGroup: 1
    },
    // FortiOS PSK (IPsec)
    {
        pattern: /set\s+psksecret\s+(ENC\s+\S+|"[^"]+")/gi,
        context: 'IPsec PSK',
        captureGroup: 1
    },
    // FortiOS SNMP community
    {
        pattern: /set\s+community\s+"?([^"\s]+)"?/gi,
        context: 'SNMP community',
        captureGroup: 1
    },
    // FortiOS TACACS+ key
    {
        pattern: /set\s+key\s+"([^"]+)"/gi,
        context: 'TACACS+ key',
        captureGroup: 1
    },
    // FortiOS RADIUS secret
    {
        pattern: /set\s+secret\s+(ENC\s+\S+|"[^"]+")/gi,
        context: 'RADIUS secret',
        captureGroup: 1
    },
    // FortiOS admin password hash
    {
        pattern: /set\s+password-hash\s+(\S+)/gi,
        context: 'password hash',
        captureGroup: 1
    },
    // FortiOS certificate
    {
        pattern: /(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/gi,
        context: 'certificate',
        captureGroup: 1
    }
];

const fortiosPasswordPromptPatterns: string[] = [];

export const fortiosVendor: Vendor = {
    name: 'fortinet',
    passwordPromptPatterns: [...genericVendor.passwordPromptPatterns, ...fortiosPasswordPromptPatterns],
    paginationPromptPatterns: ['--More--'],
    promptPatterns: [
        // Matches FGT-VM# or FGT-VM$
        /^[a-zA-Z0-9-_.()]+[#$]\s*$/
    ],
    secretPatterns: [...genericVendor.secretPatterns, ...fortiosSecretPatterns],
    subSessionCommandPatterns: genericVendor.subSessionCommandPatterns,
    subSessionSuccessPatterns: genericVendor.subSessionSuccessPatterns,
    subSessionFailurePatterns: genericVendor.subSessionFailurePatterns
};
