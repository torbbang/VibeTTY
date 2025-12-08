/**
 * Device Type Tests
 * Tests vendor-specific patterns for pagination, prompts, and secrets
 */

import { ciscoVendor } from '../cisco_ios';
import { junosVendor } from '../juniper_junos';
import { fortiosVendor } from '../fortinet_fortios';
import { genericVendor } from '../generic';
import { Vendor } from '../vendor';

describe('Device Type Patterns', () => {
    describe('Cisco IOS', () => {
        const vendor: Vendor = ciscoVendor;

        test('should have correct vendor name', () => {
            expect(vendor.name).toBe('cisco');
        });

        test('should detect Cisco pagination prompt', () => {
            const paginationText = ' --More-- ';
            const patterns = vendor.paginationPromptPatterns;

            expect(patterns).toContain(' --More-- ');
            expect(paginationText.includes(patterns[0])).toBe(true);
        });

        test('should match Cisco device prompt', () => {
            const prompts = [
                'Router>',
                'Router#',
                'Switch-1>',
                'ASR9000#',
                'core-rtr-01#'
            ];

            const promptPatterns = vendor.promptPatterns || [];
            expect(promptPatterns.length).toBeGreaterThan(0);

            prompts.forEach(prompt => {
                const matched = promptPatterns.some(pattern => pattern.test(prompt));
                expect(matched).toBe(true);
            });
        });

        test('should detect password prompts', () => {
            const passwordPrompts = [
                'Password:',
                'Password: ',
                'Enter password:',
            ];

            const patterns = vendor.passwordPromptPatterns;
            expect(patterns.length).toBeGreaterThan(0);

            // At least some password prompts should be detected
            passwordPrompts.forEach(prompt => {
                const matched = patterns.some(pattern => prompt.toLowerCase().includes(pattern.toLowerCase()));
                expect(matched).toBe(true);
            });
        });

        test('should have secret patterns for Cisco', () => {
            const secretPatterns = vendor.secretPatterns;
            expect(secretPatterns.length).toBeGreaterThan(10);

            // Check for key secret types
            const contexts = secretPatterns.map(p => p.context.toLowerCase());
            expect(contexts.some(c => c.includes('enable secret'))).toBe(true);
            expect(contexts.some(c => c.includes('tacacs'))).toBe(true);
            expect(contexts.some(c => c.includes('snmp'))).toBe(true);
        });

        test('should detect Cisco enable secret pattern', () => {
            const configLine = 'enable secret 5 $1$mERr$hx5rVt7rPNoS4wqbXKX7m0';

            // Test that at least one pattern matches this line
            const matched = vendor.secretPatterns.some(pattern => {
                return configLine.match(pattern.pattern) !== null;
            });

            expect(matched).toBe(true);
        });

        test('should detect SNMP community string', () => {
            const configLine = 'snmp-server community mySecret RO';

            // Test that at least one pattern matches this line
            const matched = vendor.secretPatterns.some(pattern => {
                return configLine.match(pattern.pattern) !== null;
            });

            expect(matched).toBe(true);
        });

        test('should detect sub-session SSH commands', () => {
            const commands = [
                'ssh 192.168.1.1',
                'ssh -l admin 10.0.0.1',
                'telnet 192.168.1.1',
                'connect router1'
            ];

            const subSessionPatterns = vendor.subSessionCommandPatterns || [];
            expect(subSessionPatterns.length).toBeGreaterThan(0);

            commands.forEach(cmd => {
                const matched = subSessionPatterns.some(pattern => pattern.test(cmd));
                expect(matched).toBe(true);
            });
        });
    });

    describe('Juniper Junos', () => {
        const vendor: Vendor = junosVendor;

        test('should have correct vendor name', () => {
            expect(vendor.name).toBe('juniper');
        });

        test('should detect Juniper pagination prompt', () => {
            const patterns = vendor.paginationPromptPatterns;

            expect(patterns).toContain('---\(more\)---');
        });

        test('should match Juniper device prompt', () => {
            const prompts = [
                'user@router>',
                'admin@switch#',
                'root@mx960>',
                'operator@ex4300#'
            ];

            const promptPatterns = vendor.promptPatterns || [];
            expect(promptPatterns.length).toBeGreaterThan(0);

            prompts.forEach(prompt => {
                const matched = promptPatterns.some(pattern => pattern.test(prompt));
                expect(matched).toBe(true);
            });
        });

        test('should have secret patterns for Juniper', () => {
            const secretPatterns = vendor.secretPatterns;
            expect(secretPatterns.length).toBeGreaterThan(5);

            const contexts = secretPatterns.map(p => p.context.toLowerCase());
            expect(contexts.some(c => c.includes('encrypted-password') || c.includes('secret'))).toBe(true);
        });

        test('should have secret patterns defined', () => {
            // Just verify Juniper has secret patterns, not test specific matches
            expect(vendor.secretPatterns.length).toBeGreaterThan(5);

            // Verify patterns have proper structure
            vendor.secretPatterns.forEach(pattern => {
                expect(pattern.pattern).toBeInstanceOf(RegExp);
                expect(pattern.context).toBeTruthy();
                expect(typeof pattern.captureGroup).toBe('number');
            });
        });
    });

    describe('FortiOS', () => {
        const vendor: Vendor = fortiosVendor;

        test('should have correct vendor name', () => {
            expect(vendor.name).toBe('fortinet');
        });

        test('should detect FortiOS pagination prompt', () => {
            const patterns = vendor.paginationPromptPatterns;
            expect(patterns).toContain('--More--');
        });

        test('should match FortiOS device prompt', () => {
            const prompts = [
                'FortiGate#',
                'FGT-1#',
                'Firewall$'
            ];

            const promptPatterns = vendor.promptPatterns || [];
            expect(promptPatterns.length).toBeGreaterThan(0);

            prompts.forEach(prompt => {
                const matched = promptPatterns.some(pattern => pattern.test(prompt));
                expect(matched).toBe(true);
            });
        });

        test('should have secret patterns for FortiOS', () => {
            const secretPatterns = vendor.secretPatterns;
            expect(secretPatterns.length).toBeGreaterThan(3);

            const contexts = secretPatterns.map(p => p.context.toLowerCase());
            expect(contexts.some(c => c.includes('password') || c.includes('psk'))).toBe(true);
        });
    });

    describe('Generic Vendor', () => {
        const vendor: Vendor = genericVendor;

        test('should have correct vendor name', () => {
            expect(vendor.name).toBe('generic');
        });

        test('should have no pagination prompts', () => {
            expect(vendor.paginationPromptPatterns).toEqual([]);
        });

        test('should match generic device prompts', () => {
            const prompts = [
                'device>',
                'host#',
                'server$',
                'linux-box#'
            ];

            const promptPatterns = vendor.promptPatterns || [];
            expect(promptPatterns.length).toBeGreaterThan(0);

            prompts.forEach(prompt => {
                const matched = promptPatterns.some(pattern => pattern.test(prompt));
                expect(matched).toBe(true);
            });
        });

        test('should have generic secret patterns', () => {
            const secretPatterns = vendor.secretPatterns;
            expect(secretPatterns.length).toBeGreaterThan(5);

            const contexts = secretPatterns.map(p => p.context.toLowerCase());
            // Generic should include basic patterns like private keys, hashes
            expect(contexts.some(c => c.includes('private key') || c.includes('password'))).toBe(true);
        });

        test('should detect PEM private key', () => {
            const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...test...
-----END RSA PRIVATE KEY-----`;

            // Test that at least one pattern matches private keys
            const matched = vendor.secretPatterns.some(pattern => {
                return privateKey.match(pattern.pattern) !== null;
            });

            expect(matched).toBe(true);
        });

        test('should have generic secret patterns defined', () => {
            // Verify generic vendor has secret patterns
            expect(vendor.secretPatterns.length).toBeGreaterThan(5);

            // Verify patterns have proper structure
            vendor.secretPatterns.forEach(pattern => {
                expect(pattern.pattern).toBeInstanceOf(RegExp);
                expect(pattern.context).toBeTruthy();
                expect(typeof pattern.captureGroup).toBe('number');
            });
        });
    });

    describe('Pattern Coverage', () => {
        test('all vendors should have secret patterns', () => {
            const vendors = [ciscoVendor, junosVendor, fortiosVendor, genericVendor];

            vendors.forEach(vendor => {
                expect(vendor.secretPatterns).toBeDefined();
                expect(vendor.secretPatterns.length).toBeGreaterThan(0);
            });
        });

        test('all secret patterns should have valid capture groups', () => {
            const vendors = [ciscoVendor, junosVendor, fortiosVendor, genericVendor];

            vendors.forEach(vendor => {
                vendor.secretPatterns.forEach(pattern => {
                    expect(pattern.captureGroup).toBeGreaterThanOrEqual(0);
                    expect(pattern.context).toBeTruthy();
                    expect(pattern.pattern).toBeInstanceOf(RegExp);
                });
            });
        });

        test('all prompt patterns should be valid RegExp', () => {
            const vendors = [ciscoVendor, junosVendor, fortiosVendor, genericVendor];

            vendors.forEach(vendor => {
                if (vendor.promptPatterns) {
                    vendor.promptPatterns.forEach(pattern => {
                        expect(pattern).toBeInstanceOf(RegExp);
                        // Should be able to test against a sample string
                        expect(() => pattern.test('test#')).not.toThrow();
                    });
                }
            });
        });

        test('pagination prompts should be strings', () => {
            const vendors = [ciscoVendor, junosVendor, fortiosVendor, genericVendor];

            vendors.forEach(vendor => {
                expect(Array.isArray(vendor.paginationPromptPatterns)).toBe(true);
                vendor.paginationPromptPatterns.forEach(pattern => {
                    expect(typeof pattern).toBe('string');
                });
            });
        });
    });

    describe('Sub-Session Detection', () => {
        test('Cisco should detect various SSH command formats', () => {
            const vendor = ciscoVendor;
            const subSessionPatterns = vendor.subSessionCommandPatterns || [];

            const testCommands = [
                'ssh 192.168.1.1',
                'ssh admin@10.0.0.1',
                'ssh -l user host.com',
                'ssh user@host -p 2222',
                'telnet 192.168.1.1',
                'telnet 10.0.0.1 23',
                'connect router1',
                'connect router2 /vrf MGMT'
            ];

            testCommands.forEach(cmd => {
                const matched = subSessionPatterns.some(pattern => pattern.test(cmd));
                expect(matched).toBe(true);
            });
        });

        test('should not match non-subsession commands', () => {
            const vendor = ciscoVendor;
            const subSessionPatterns = vendor.subSessionCommandPatterns || [];

            const nonSubSessionCommands = [
                'show version',
                'configure terminal',
                'interface GigabitEthernet0/1',
                'ip address 192.168.1.1 255.255.255.0'
            ];

            nonSubSessionCommands.forEach(cmd => {
                const matched = subSessionPatterns.some(pattern => pattern.test(cmd));
                expect(matched).toBe(false);
            });
        });
    });
});
