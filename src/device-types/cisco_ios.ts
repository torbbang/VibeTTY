import { Vendor, SecretPattern } from './vendor';
import { genericVendor } from './generic';

const ciscoSecretPatterns: SecretPattern[] = [
    // Cisco IOS enable secret (Type 5 hash)
    {
        pattern: /enable\s+secret\s+5\s+(\$1\$.*)/gi,
        context: 'enable secret (Type 5)',
        captureGroup: 1
    },
    // Cisco IOS username secret (Type 5 hash)
    {
        pattern: /username\s+\S+\s+secret\s+5\s+(\$1\$.*)/gi,
        context: 'username secret (Type 5)',
        captureGroup: 1
    },
    // Cisco IOS modern secrets (Type 4, 8, 9)
    {
        pattern: /secret\s+[489]\s+([a-zA-Z0-9$./]+)/gi,
        context: 'secret (Type 4/8/9)',
        captureGroup: 1
    },
    // Cisco IOS username password (often Type 7 or cleartext)
    {
        pattern: /username\s+\S+\s+password\s+(?:0\s+|7\s+)?(\S+)/gi,
        context: 'username password',
        captureGroup: 1
    },
    // Generic encrypted password (like password 7 ...)
    {
        pattern: /password\s+(?:[0-9]{1,2}\s+)?([0-9a-fA-F]{10,})/gi,
        context: 'encrypted password',
        captureGroup: 1
    },
    // Cisco PKI certificate chains (starts with "crypto pki certificate chain")
    {
        pattern: /(crypto\s+pki\s+certificate\s+chain\s+\S+[\s\S]*?quit)/gi,
        context: 'PKI certificate chain',
        captureGroup: 1
    },
    // Cisco IKEv2 keyring pre-shared keys
    {
        pattern: /pre-shared-key\s+(?:local|remote)\s+([^\s\n]+)/gi,
        context: 'IKEv2 pre-shared key',
        captureGroup: 1
    },
    // TACACS+ server key (with various syntaxes)
    {
        pattern: /tacacs(?:-server)?\s+(?:host\s+\S+\s+)?key\s+(?:0\s+|7\s+)?([^\s\r\n]+)/gi,
        context: 'TACACS+ key',
        captureGroup: 1
    },
    // RADIUS server key
    {
        pattern: /radius(?:-server)?\s+(?:host\s+\S+\s+)?key\s+(?:0\s+|7\s+)?([^\s\r\n]+)/gi,
        context: 'RADIUS key',
        captureGroup: 1
    },
    // SNMP community strings (v1/v2c)
    {
        pattern: /snmp-server\s+community\s+([^\s]+)\s+(?:RO|RW)/gi,
        context: 'SNMP community string',
        captureGroup: 1
    },
    // SNMP v3 authentication password
    {
        pattern: /snmp-server\s+user\s+\S+\s+\S+\s+v3\s+(?:encrypted\s+)?auth\s+(?:md5|sha)\s+([^\s]+)/gi,
        context: 'SNMP v3 auth password',
        captureGroup: 1
    },
    // SNMP v3 privacy password
    {
        pattern: /snmp-server\s+user\s+\S+\s+\S+\s+v3\s+(?:encrypted\s+)?(?:auth\s+(?:md5|sha)\s+\S+\s+)?priv\s+(?:des|3des|aes)\s+([^\s]+)/gi,
        context: 'SNMP v3 priv password',
        captureGroup: 1
    },
    // BGP neighbor password
    {
        pattern: /neighbor\s+\S+\s+password\s+(?:0\s+|7\s+)?([^\s\r\n]+)/gi,
        context: 'BGP neighbor password',
        captureGroup: 1
    },
    // OSPF authentication key
    {
        pattern: /ip\s+ospf\s+(?:message-digest-)?key\s+\d+\s+(?:md5|sha)\s+(?:0\s+|7\s+)?([^\s\r\n]+)/gi,
        context: 'OSPF authentication key',
        captureGroup: 1
    },
    // EIGRP authentication key-string
    {
        pattern: /key-string\s+(?:0\s+|7\s+)?([^\s\r\n]+)/gi,
        context: 'EIGRP key-string',
        captureGroup: 1
    },
    // Line password (console/vty)
    {
        pattern: /(?:line\s+(?:con|vty|aux)[\s\S]{0,100}?)password\s+(?:0\s+|7\s+)?([^\s\r\n]+)/gi,
        context: 'line password',
        captureGroup: 1
    },
    // WPA PSK (wireless)
    {
        pattern: /wpa-psk\s+(?:ascii|hex)\s+(?:0\s+|7\s+)?([^\s\r\n]+)/gi,
        context: 'WPA PSK',
        captureGroup: 1
    }
];

const ciscoPasswordPromptPatterns: string[] = [
    'enable password:',
    'enable secret:',
    'enable:'
];

const ciscoSubSessionCommandPatterns: RegExp[] = [
    // Standard SSH/Telnet commands
    ...(genericVendor.subSessionCommandPatterns || []),
    // Cisco-specific: connect command (used in IOS)
    /^connect\s+([^\s]+)/,
    // Cisco-specific: ssh with various options
    /^ssh\s+(?:-l\s+\S+\s+)?(?:-v\s+[12]\s+)?([^\s]+)/,
    // Cisco-specific: telnet with IP
    /^telnet\s+(\d+\.\d+\.\d+\.\d+)/
];

const ciscoSubSessionSuccessPatterns: RegExp[] = [
    // Successful subsession means we got a device prompt (not just a password prompt)
    // Cisco prompts: hostname>, hostname#, hostname(config)#, etc.
    // Match prompts that appear anywhere in the data (not just line-anchored)
    /[A-Za-z0-9_-]+[>#]\s*$/m,
    /[A-Za-z0-9_-]+\(config[^\)]*\)#\s*$/m
];

const ciscoSubSessionFailurePatterns: RegExp[] = [
    /%% Unknown command or computer name/i,
    /% Invalid input detected/i,
    /Connection refused/i,
    /Connection timed out/i,
    /No route to host/i,
    /% Password.*timeout expired/i,
    /% Authentication failed/i,
    /% Bad passwords/i,
    /Connection closed by/i
];

export const ciscoVendor: Vendor = {
    name: 'cisco',
    passwordPromptPatterns: [...genericVendor.passwordPromptPatterns, ...ciscoPasswordPromptPatterns],
    paginationPromptPatterns: [' --More-- '],
    promptPatterns: [
        // Matches standard, privileged, and config modes
        // R1>, R1#, R1(config)#, R1(config-if)#
        /^[a-zA-Z0-9-_.()]+[>#]\s*$/
    ],
    secretPatterns: [...genericVendor.secretPatterns, ...ciscoSecretPatterns],
    subSessionCommandPatterns: ciscoSubSessionCommandPatterns,
    subSessionSuccessPatterns: ciscoSubSessionSuccessPatterns,
    subSessionFailurePatterns: ciscoSubSessionFailurePatterns
};
