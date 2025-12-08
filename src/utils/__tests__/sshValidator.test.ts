/**
 * SSH Validator Tests
 * Tests input validation for SSH connection settings
 */

import { validatePortForward, validateProxyJump, validateProxyCommand } from '../sshValidator';

describe('SSH Validator', () => {
    describe('validatePortForward', () => {
        test('should accept valid local port forward', () => {
            expect(validatePortForward('8080:localhost:80')).toBeNull();
            expect(validatePortForward('3306:db.example.com:3306')).toBeNull();
        });

        test('should accept valid port forward with bind address', () => {
            expect(validatePortForward('127.0.0.1:8080:localhost:80')).toBeNull();
            expect(validatePortForward('0.0.0.0:3000:app:3000')).toBeNull();
        });

        test('should accept valid dynamic forward (SOCKS)', () => {
            expect(validatePortForward('1080')).toBeNull();
            expect(validatePortForward('127.0.0.1:9050')).toBeNull();
        });

        test('should reject invalid port numbers', () => {
            expect(validatePortForward('0:localhost:80')).toContain('Invalid port');
            expect(validatePortForward('99999:localhost:80')).toContain('Invalid port');
            expect(validatePortForward('8080:localhost:0')).toContain('Invalid port');
        });

        test('should reject dangerous shell characters', () => {
            expect(validatePortForward('8080;rm -rf /')).toContain('invalid characters');
            expect(validatePortForward('8080|cat /etc/passwd')).toContain('invalid characters');
            expect(validatePortForward('8080`whoami`')).toContain('invalid characters');
            expect(validatePortForward('8080$(id)')).toContain('invalid characters');
            expect(validatePortForward('8080&& whoami')).toContain('invalid characters');
        });

        test('should reject empty input', () => {
            expect(validatePortForward('')).toContain('cannot be empty');
            expect(validatePortForward('   ')).toContain('cannot be empty');
        });

        test('should reject IPv6 with brackets (not currently supported)', () => {
            // IPv6 addresses with brackets contain special chars that validator rejects
            // This is acceptable - IPv6 support can be added later if needed
            expect(validatePortForward('[::1]:8080:localhost:80')).not.toBeNull();
        });
    });

    describe('validateProxyJump', () => {
        test('should accept valid simple jump host', () => {
            expect(validateProxyJump('bastion.example.com')).toBeNull();
            expect(validateProxyJump('192.168.1.1')).toBeNull();
        });

        test('should accept jump host with user', () => {
            expect(validateProxyJump('admin@bastion.example.com')).toBeNull();
            expect(validateProxyJump('root@10.0.0.1')).toBeNull();
        });

        test('should accept jump host with port', () => {
            expect(validateProxyJump('bastion.example.com:2222')).toBeNull();
            expect(validateProxyJump('admin@bastion:22')).toBeNull();
        });

        test('should accept multiple jump hosts', () => {
            expect(validateProxyJump('bastion1,bastion2')).toBeNull();
            expect(validateProxyJump('user@jump1:22,user@jump2:2222')).toBeNull();
        });

        test('should reject dangerous shell characters', () => {
            expect(validateProxyJump('bastion;whoami')).toContain('invalid characters');
            expect(validateProxyJump('bastion|cat /etc/passwd')).toContain('invalid characters');
            expect(validateProxyJump('bastion`id`')).toContain('invalid characters');
            expect(validateProxyJump('bastion$(whoami)')).toContain('invalid characters');
        });

        test('should reject empty input', () => {
            expect(validateProxyJump('')).toContain('cannot be empty');
            expect(validateProxyJump('   ')).toContain('cannot be empty');
        });
    });

    describe('validateProxyCommand', () => {
        test('should accept valid proxy command', () => {
            expect(validateProxyCommand('nc %h %p')).toBeNull();
            expect(validateProxyCommand('socat - PROXY:proxy:host:port')).toBeNull();
        });

        test('should reject dangerous shell characters', () => {
            expect(validateProxyCommand('nc %h %p; rm -rf /')).toContain('invalid');
            expect(validateProxyCommand('nc | cat /etc/shadow')).toContain('invalid');
            expect(validateProxyCommand('nc `whoami` %h')).toContain('invalid');
            expect(validateProxyCommand('nc $(id) %h')).toContain('invalid');
            expect(validateProxyCommand('nc & whoami')).toContain('invalid');
        });

        test('should reject quotes and escapes', () => {
            expect(validateProxyCommand('nc "malicious" %h')).toContain('invalid');
            expect(validateProxyCommand("nc 'malicious' %h")).toContain('invalid');
            expect(validateProxyCommand('nc \\$PATH %h')).toContain('invalid');
        });

        test('should reject empty input', () => {
            expect(validateProxyCommand('')).toContain('cannot be empty');
            expect(validateProxyCommand('   ')).toContain('cannot be empty');
        });
    });

    describe('Command Injection Prevention', () => {
        test('should prevent command injection via semicolon', () => {
            expect(validatePortForward('8080; whoami')).not.toBeNull();
            expect(validateProxyJump('host; whoami')).not.toBeNull();
            expect(validateProxyCommand('nc; whoami')).not.toBeNull();
        });

        test('should prevent command injection via pipe', () => {
            expect(validatePortForward('8080 | cat /etc/passwd')).not.toBeNull();
            expect(validateProxyJump('host | id')).not.toBeNull();
            expect(validateProxyCommand('nc | id')).not.toBeNull();
        });

        test('should prevent command injection via backticks', () => {
            expect(validatePortForward('8080`whoami`')).not.toBeNull();
            expect(validateProxyJump('host`id`')).not.toBeNull();
            expect(validateProxyCommand('nc`whoami`')).not.toBeNull();
        });

        test('should prevent command injection via command substitution', () => {
            expect(validatePortForward('8080$(id)')).not.toBeNull();
            expect(validateProxyJump('host$(whoami)')).not.toBeNull();
            expect(validateProxyCommand('nc$(id)')).not.toBeNull();
        });

        test('should prevent command injection via background operator', () => {
            expect(validatePortForward('8080 & whoami')).not.toBeNull();
            expect(validateProxyJump('host & id')).not.toBeNull();
            expect(validateProxyCommand('nc & whoami')).not.toBeNull();
        });

        test('should prevent command injection via redirection', () => {
            expect(validatePortForward('8080 > /tmp/pwned')).not.toBeNull();
            expect(validatePortForward('8080 < /etc/passwd')).not.toBeNull();
            expect(validateProxyJump('host >> /tmp/log')).not.toBeNull();
            expect(validateProxyCommand('nc > /tmp/out')).not.toBeNull();
        });

        test('should prevent command injection via logical operators', () => {
            expect(validatePortForward('8080 && whoami')).not.toBeNull();
            expect(validatePortForward('8080 || id')).not.toBeNull();
            expect(validateProxyJump('host && whoami')).not.toBeNull();
            expect(validateProxyCommand('nc && id')).not.toBeNull();
        });

        test('should prevent command injection via subshells', () => {
            expect(validatePortForward('8080 (whoami)')).not.toBeNull();
            expect(validateProxyJump('host {id}')).not.toBeNull();
            expect(validateProxyCommand('nc (whoami)')).not.toBeNull();
        });

        test('should prevent command injection via arrays', () => {
            expect(validatePortForward('8080 [malicious]')).not.toBeNull();
            expect(validateProxyJump('host[attack]')).not.toBeNull();
            expect(validateProxyCommand('nc[pwn]')).not.toBeNull();
        });

        test('should prevent command injection via escapes', () => {
            expect(validatePortForward('8080\\; whoami')).not.toBeNull();
            expect(validateProxyJump('host\\" attack')).not.toBeNull();
            expect(validateProxyCommand('nc\\` whoami \\`')).not.toBeNull();
        });

        test('should prevent command injection via variable expansion', () => {
            expect(validatePortForward('$PORT:localhost:80')).not.toBeNull();
            expect(validateProxyJump('$HOST')).not.toBeNull();
            expect(validateProxyCommand('nc $HOST %p')).not.toBeNull();
        });

        test('should prevent command injection via exclamation mark', () => {
            expect(validatePortForward('8080!whoami')).not.toBeNull();
            expect(validateProxyJump('host!')).not.toBeNull();
            expect(validateProxyCommand('nc !!')).not.toBeNull();
        });
    });

    describe('Edge Cases', () => {
        test('should handle whitespace correctly', () => {
            expect(validatePortForward('8080:localhost:80 ')).toBeNull();
            expect(validatePortForward(' 8080:localhost:80')).toBeNull();
        });

        test('should handle null/undefined', () => {
            expect(validatePortForward(null as any)).toContain('cannot be empty');
            expect(validatePortForward(undefined as any)).toContain('cannot be empty');
            expect(validateProxyJump(null as any)).toContain('cannot be empty');
            expect(validateProxyJump(undefined as any)).toContain('cannot be empty');
        });

        test('should handle very long valid input', () => {
            const longHost = 'a'.repeat(100) + '.example.com';
            expect(validateProxyJump(longHost)).toBeNull();
        });

        test('should handle simple IPv6 addresses', () => {
            // Simple IPv6 without brackets works (colons alone are allowed in ProxyJump)
            expect(validateProxyJump('2001:db8::1')).toBeNull();

            // IPv6 with brackets is rejected (special chars)
            // This is acceptable - IPv6 bracket notation not currently supported
            expect(validateProxyJump('user@[2001:db8::1]:22')).not.toBeNull();
        });
    });
});
