/**
 * Approval Gate Tests
 * Tests strict mode functionality for LLM interactions
 */

import { ApprovalGate, ApprovalRequest } from '../approvalGate';

// Mock the ApprovalDialog
jest.mock('../../ui/approvalDialog', () => ({
    ApprovalDialog: {
        show: jest.fn()
    }
}));

import { ApprovalDialog } from '../../ui/approvalDialog';

describe('ApprovalGate', () => {
    let gate: ApprovalGate;

    beforeEach(() => {
        gate = ApprovalGate.getInstance();
        // Reset to non-strict mode for each test
        gate.setStrictMode(false);
        jest.clearAllMocks();
    });

    describe('Singleton Pattern', () => {
        test('should return same instance', () => {
            const instance1 = ApprovalGate.getInstance();
            const instance2 = ApprovalGate.getInstance();

            expect(instance1).toBe(instance2);
        });
    });

    describe('Strict Mode State Management', () => {
        test('should start with strict mode disabled', () => {
            expect(gate.isStrictMode()).toBe(false);
        });

        test('should enable strict mode', () => {
            gate.setStrictMode(true);
            expect(gate.isStrictMode()).toBe(true);
        });

        test('should disable strict mode', () => {
            gate.setStrictMode(true);
            expect(gate.isStrictMode()).toBe(true);

            gate.setStrictMode(false);
            expect(gate.isStrictMode()).toBe(false);
        });

        test('should persist strict mode state', () => {
            gate.setStrictMode(true);
            expect(gate.isStrictMode()).toBe(true);

            // Toggle off and on
            gate.setStrictMode(false);
            gate.setStrictMode(true);

            expect(gate.isStrictMode()).toBe(true);
        });
    });

    describe('Output Approval - Non-Strict Mode', () => {
        beforeEach(() => {
            gate.setStrictMode(false);
        });

        test('should auto-approve output when strict mode disabled', async () => {
            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: 'show version output',
                context: 'Reading terminal output',
                timestamp: new Date()
            };

            const result = await gate.approveOutput(request);

            expect(result).toBe('show version output');
            expect(ApprovalDialog.show).not.toHaveBeenCalled();
        });

        test('should auto-approve commands when strict mode disabled', async () => {
            const request: ApprovalRequest = {
                type: 'command',
                sessionId: 'test-session',
                content: 'show ip interface brief',
                context: 'Executing command',
                timestamp: new Date()
            };

            const result = await gate.approveCommand(request);

            expect(result).toBe('show ip interface brief');
            expect(ApprovalDialog.show).not.toHaveBeenCalled();
        });
    });

    describe('Output Approval - Strict Mode', () => {
        beforeEach(() => {
            gate.setStrictMode(true);
        });

        test('should request approval for output', async () => {
            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: 'sensitive output data',
                context: 'Reading terminal output',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: true,
                modifiedContent: undefined
            });

            const result = await gate.approveOutput(request);

            expect(ApprovalDialog.show).toHaveBeenCalledWith(request);
            expect(result).toBe('sensitive output data');
        });

        test('should reject output when user denies', async () => {
            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: 'output to reject',
                context: 'Reading terminal output',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: false
            });

            const result = await gate.approveOutput(request);

            expect(result).toBeNull();
        });

        test('should return modified output when user edits', async () => {
            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: 'original output',
                context: 'Reading terminal output',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: true,
                modifiedContent: 'modified output by user'
            });

            const result = await gate.approveOutput(request);

            expect(result).toBe('modified output by user');
        });
    });

    describe('Command Approval - Strict Mode', () => {
        beforeEach(() => {
            gate.setStrictMode(true);
        });

        test('should request approval for command', async () => {
            const request: ApprovalRequest = {
                type: 'command',
                sessionId: 'test-session',
                content: 'configure terminal',
                context: 'Executing command from LLM',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: true,
                modifiedContent: undefined
            });

            const result = await gate.approveCommand(request);

            expect(ApprovalDialog.show).toHaveBeenCalledWith(request);
            expect(result).toBe('configure terminal');
        });

        test('should reject command when user denies', async () => {
            const request: ApprovalRequest = {
                type: 'command',
                sessionId: 'test-session',
                content: 'reload',
                context: 'Executing command',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: false
            });

            const result = await gate.approveCommand(request);

            expect(result).toBeNull();
        });

        test('should return modified command when user edits', async () => {
            const request: ApprovalRequest = {
                type: 'command',
                sessionId: 'test-session',
                content: 'show running-config',
                context: 'Executing command',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: true,
                modifiedContent: 'show running-config | include hostname'
            });

            const result = await gate.approveCommand(request);

            expect(result).toBe('show running-config | include hostname');
        });

        test('should handle multiple approval requests', async () => {
            const request1: ApprovalRequest = {
                type: 'command',
                sessionId: 'session-1',
                content: 'show version',
                context: 'First command',
                timestamp: new Date()
            };

            const request2: ApprovalRequest = {
                type: 'command',
                sessionId: 'session-2',
                content: 'show interfaces',
                context: 'Second command',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock)
                .mockResolvedValueOnce({ approved: true })
                .mockResolvedValueOnce({ approved: false });

            const result1 = await gate.approveCommand(request1);
            const result2 = await gate.approveCommand(request2);

            expect(result1).toBe('show version');
            expect(result2).toBeNull();
            expect(ApprovalDialog.show).toHaveBeenCalledTimes(2);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty content in non-strict mode', async () => {
            gate.setStrictMode(false);

            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: '',
                context: 'Empty output',
                timestamp: new Date()
            };

            const result = await gate.approveOutput(request);
            expect(result).toBe('');
        });

        test('should handle empty content in strict mode', async () => {
            gate.setStrictMode(true);

            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: '',
                context: 'Empty output',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: true
            });

            const result = await gate.approveOutput(request);
            expect(result).toBe('');
        });

        test('should handle very long content', async () => {
            gate.setStrictMode(true);

            const longContent = 'x'.repeat(100000); // 100KB of data

            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: longContent,
                context: 'Large output',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({
                approved: true
            });

            const result = await gate.approveOutput(request);
            expect(result).toBe(longContent);
        });

        test('should handle special characters in content', async () => {
            gate.setStrictMode(false);

            const specialContent = 'Content with\nnewlines\tand\ttabs\rand\rcarriage\x1b[0mANSI';

            const request: ApprovalRequest = {
                type: 'output',
                sessionId: 'test-session',
                content: specialContent,
                context: 'Special characters',
                timestamp: new Date()
            };

            const result = await gate.approveOutput(request);
            expect(result).toBe(specialContent);
        });
    });

    describe('Request Types', () => {
        beforeEach(() => {
            gate.setStrictMode(true);
        });

        test('should differentiate between output and command requests', async () => {
            const outputRequest: ApprovalRequest = {
                type: 'output',
                sessionId: 'test',
                content: 'output data',
                context: 'output context',
                timestamp: new Date()
            };

            const commandRequest: ApprovalRequest = {
                type: 'command',
                sessionId: 'test',
                content: 'command data',
                context: 'command context',
                timestamp: new Date()
            };

            (ApprovalDialog.show as jest.Mock).mockResolvedValue({ approved: true });

            await gate.approveOutput(outputRequest);
            await gate.approveCommand(commandRequest);

            expect(ApprovalDialog.show).toHaveBeenCalledTimes(2);
            expect(ApprovalDialog.show).toHaveBeenNthCalledWith(1, outputRequest);
            expect(ApprovalDialog.show).toHaveBeenNthCalledWith(2, commandRequest);
        });
    });
});
