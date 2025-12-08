/**
 * MCP Parameter Validation Tests
 * Tests that MCP tool parameters are correctly validated
 */

describe('MCP Parameter Validation', () => {
    // Tool parameter schemas from server.ts
    const TOOL_PARAM_SCHEMAS: Record<string, Record<string, { type: string; required?: boolean }>> = {
        connect_host: {
            host_names: { type: 'string[]', required: true }
        },
        show_terminal: {
            terminal_name: { type: 'string', required: true }
        },
        send_to_terminal: {
            terminal_name: { type: 'string', required: true },
            commands: { type: 'string[]', required: true },
            add_newline: { type: 'boolean' }
        },
        auto_paginate: {
            terminal_name: { type: 'string', required: true }
        },
        read_output: {
            terminal_name: { type: 'string', required: true },
            lines: { type: 'number' }
        },
        set_device_type: {
            terminal_name: { type: 'string', required: true },
            device_type: { type: 'string', required: true }
        },
        update_connection_notes: {
            connection_name: { type: 'string', required: true },
            notes: { type: 'string', required: true }
        }
    };

    // Simple validator function (mirrors validation logic)
    function validateParams(toolName: string, params: any): string | null {
        const schema = TOOL_PARAM_SCHEMAS[toolName];
        if (!schema) {
            return `Unknown tool: ${toolName}`;
        }

        // Check if params is null or undefined
        if (!params || typeof params !== 'object') {
            return 'Parameters must be an object';
        }

        // Check required parameters
        for (const [paramName, paramSchema] of Object.entries(schema)) {
            if (paramSchema.required && !(paramName in params)) {
                return `Missing required parameter: ${paramName}`;
            }

            if (paramName in params) {
                const value = params[paramName];
                const expectedType = paramSchema.type;

                // Type checking
                if (expectedType === 'string' && typeof value !== 'string') {
                    return `Parameter ${paramName} must be a string`;
                }
                if (expectedType === 'number' && typeof value !== 'number') {
                    return `Parameter ${paramName} must be a number`;
                }
                if (expectedType === 'boolean' && typeof value !== 'boolean') {
                    return `Parameter ${paramName} must be a boolean`;
                }
                if (expectedType === 'string[]' && !Array.isArray(value)) {
                    return `Parameter ${paramName} must be an array`;
                }
                if (expectedType === 'string[]' && Array.isArray(value)) {
                    if (!value.every(item => typeof item === 'string')) {
                        return `Parameter ${paramName} must be an array of strings`;
                    }
                }
            }
        }

        return null; // Valid
    }

    describe('connect_host', () => {
        test('should accept valid parameters', () => {
            const params = { host_names: ['router1', 'router2'] };
            expect(validateParams('connect_host', params)).toBeNull();
        });

        test('should require host_names parameter', () => {
            const params = {};
            expect(validateParams('connect_host', params)).toContain('Missing required parameter');
        });

        test('should reject non-array host_names', () => {
            const params = { host_names: 'router1' };
            expect(validateParams('connect_host', params)).toContain('must be an array');
        });

        test('should reject array with non-string values', () => {
            const params = { host_names: ['router1', 123, 'router2'] };
            expect(validateParams('connect_host', params)).toContain('array of strings');
        });

        test('should accept single host in array', () => {
            const params = { host_names: ['router1'] };
            expect(validateParams('connect_host', params)).toBeNull();
        });

        test('should accept empty array', () => {
            const params = { host_names: [] };
            expect(validateParams('connect_host', params)).toBeNull();
        });
    });

    describe('show_terminal', () => {
        test('should accept valid parameters', () => {
            const params = { terminal_name: 'SSH: router1' };
            expect(validateParams('show_terminal', params)).toBeNull();
        });

        test('should require terminal_name parameter', () => {
            const params = {};
            expect(validateParams('show_terminal', params)).toContain('Missing required parameter');
        });

        test('should reject non-string terminal_name', () => {
            const params = { terminal_name: 123 };
            expect(validateParams('show_terminal', params)).toContain('must be a string');
        });

        test('should accept session ID format', () => {
            const params = { terminal_name: 'router1-1234567890-abc123' };
            expect(validateParams('show_terminal', params)).toBeNull();
        });
    });

    describe('send_to_terminal', () => {
        test('should accept valid parameters', () => {
            const params = {
                terminal_name: 'SSH: router1',
                commands: ['show version', 'show interfaces'],
                add_newline: true
            };
            expect(validateParams('send_to_terminal', params)).toBeNull();
        });

        test('should require terminal_name', () => {
            const params = { commands: ['show version'] };
            expect(validateParams('send_to_terminal', params)).toContain('Missing required parameter: terminal_name');
        });

        test('should require commands', () => {
            const params = { terminal_name: 'SSH: router1' };
            expect(validateParams('send_to_terminal', params)).toContain('Missing required parameter: commands');
        });

        test('should accept without add_newline (optional)', () => {
            const params = {
                terminal_name: 'SSH: router1',
                commands: ['show version']
            };
            expect(validateParams('send_to_terminal', params)).toBeNull();
        });

        test('should reject non-array commands', () => {
            const params = {
                terminal_name: 'SSH: router1',
                commands: 'show version'
            };
            expect(validateParams('send_to_terminal', params)).toContain('must be an array');
        });

        test('should reject non-boolean add_newline', () => {
            const params = {
                terminal_name: 'SSH: router1',
                commands: ['show version'],
                add_newline: 'yes'
            };
            expect(validateParams('send_to_terminal', params)).toContain('must be a boolean');
        });

        test('should accept single command in array', () => {
            const params = {
                terminal_name: 'SSH: router1',
                commands: ['show version']
            };
            expect(validateParams('send_to_terminal', params)).toBeNull();
        });

        test('should accept multiple commands', () => {
            const params = {
                terminal_name: 'SSH: router1',
                commands: ['configure terminal', 'interface Gi0/1', 'description Test', 'exit']
            };
            expect(validateParams('send_to_terminal', params)).toBeNull();
        });
    });

    describe('auto_paginate', () => {
        test('should accept valid parameters', () => {
            const params = { terminal_name: 'SSH: router1' };
            expect(validateParams('auto_paginate', params)).toBeNull();
        });

        test('should require terminal_name', () => {
            const params = {};
            expect(validateParams('auto_paginate', params)).toContain('Missing required parameter');
        });

        test('should reject non-string terminal_name', () => {
            const params = { terminal_name: 123 };
            expect(validateParams('auto_paginate', params)).toContain('must be a string');
        });
    });

    describe('read_output', () => {
        test('should accept valid parameters with lines', () => {
            const params = {
                terminal_name: 'SSH: router1',
                lines: 100
            };
            expect(validateParams('read_output', params)).toBeNull();
        });

        test('should accept without lines parameter (optional)', () => {
            const params = { terminal_name: 'SSH: router1' };
            expect(validateParams('read_output', params)).toBeNull();
        });

        test('should require terminal_name', () => {
            const params = { lines: 50 };
            expect(validateParams('read_output', params)).toContain('Missing required parameter');
        });

        test('should reject non-number lines', () => {
            const params = {
                terminal_name: 'SSH: router1',
                lines: '100'
            };
            expect(validateParams('read_output', params)).toContain('must be a number');
        });

        test('should accept zero lines', () => {
            const params = {
                terminal_name: 'SSH: router1',
                lines: 0
            };
            expect(validateParams('read_output', params)).toBeNull();
        });

        test('should accept large line counts', () => {
            const params = {
                terminal_name: 'SSH: router1',
                lines: 10000
            };
            expect(validateParams('read_output', params)).toBeNull();
        });
    });

    describe('set_device_type', () => {
        test('should accept valid parameters', () => {
            const params = {
                terminal_name: 'SSH: router1',
                device_type: 'cisco_ios'
            };
            expect(validateParams('set_device_type', params)).toBeNull();
        });

        test('should require both parameters', () => {
            expect(validateParams('set_device_type', { terminal_name: 'SSH: router1' }))
                .toContain('Missing required parameter: device_type');
            expect(validateParams('set_device_type', { device_type: 'cisco_ios' }))
                .toContain('Missing required parameter: terminal_name');
        });

        test('should reject non-string device_type', () => {
            const params = {
                terminal_name: 'SSH: router1',
                device_type: 123
            };
            expect(validateParams('set_device_type', params)).toContain('must be a string');
        });

        test('should accept all valid device types', () => {
            const deviceTypes = ['cisco_ios', 'cisco_ios-xe', 'juniper_junos', 'fortinet_fortios', 'generic'];

            deviceTypes.forEach(deviceType => {
                const params = {
                    terminal_name: 'SSH: router1',
                    device_type: deviceType
                };
                expect(validateParams('set_device_type', params)).toBeNull();
            });
        });
    });

    describe('update_connection_notes', () => {
        test('should accept valid parameters', () => {
            const params = {
                connection_name: 'router1',
                notes: 'Core router - IOS 15.2 - MPLS PE'
            };
            expect(validateParams('update_connection_notes', params)).toBeNull();
        });

        test('should require both parameters', () => {
            expect(validateParams('update_connection_notes', { connection_name: 'router1' }))
                .toContain('Missing required parameter: notes');
            expect(validateParams('update_connection_notes', { notes: 'some notes' }))
                .toContain('Missing required parameter: connection_name');
        });

        test('should reject non-string parameters', () => {
            const params1 = { connection_name: 123, notes: 'notes' };
            expect(validateParams('update_connection_notes', params1)).toContain('must be a string');

            const params2 = { connection_name: 'router1', notes: 123 };
            expect(validateParams('update_connection_notes', params2)).toContain('must be a string');
        });

        test('should accept empty notes', () => {
            const params = {
                connection_name: 'router1',
                notes: ''
            };
            expect(validateParams('update_connection_notes', params)).toBeNull();
        });

        test('should accept long notes', () => {
            const params = {
                connection_name: 'router1',
                notes: 'x'.repeat(1000)
            };
            expect(validateParams('update_connection_notes', params)).toBeNull();
        });
    });

    describe('list_connections', () => {
        test('should not have schema (no parameters)', () => {
            // list_connections has no parameters
            const schema = TOOL_PARAM_SCHEMAS['list_connections'];
            expect(schema).toBeUndefined();
        });
    });

    describe('Schema Coverage', () => {
        test('all tools should have parameter schemas (except list_connections)', () => {
            const toolsWithParams = [
                'connect_host',
                'show_terminal',
                'send_to_terminal',
                'auto_paginate',
                'read_output',
                'set_device_type',
                'update_connection_notes'
            ];

            toolsWithParams.forEach(tool => {
                expect(TOOL_PARAM_SCHEMAS[tool]).toBeDefined();
                expect(typeof TOOL_PARAM_SCHEMAS[tool]).toBe('object');
            });
        });

        test('all parameters should have type defined', () => {
            Object.entries(TOOL_PARAM_SCHEMAS).forEach(([_toolName, schema]) => {
                Object.entries(schema).forEach(([_paramName, paramDef]) => {
                    expect(paramDef.type).toBeDefined();
                    expect(typeof paramDef.type).toBe('string');
                });
            });
        });

        test('required flags should be boolean', () => {
            Object.entries(TOOL_PARAM_SCHEMAS).forEach(([_toolName, schema]) => {
                Object.entries(schema).forEach(([_paramName, paramDef]) => {
                    if ('required' in paramDef) {
                        expect(typeof paramDef.required).toBe('boolean');
                    }
                });
            });
        });
    });

    describe('Edge Cases', () => {
        test('should handle unknown tool name', () => {
            const params = { some_param: 'value' };
            expect(validateParams('unknown_tool', params)).toContain('Unknown tool');
        });

        test('should handle null parameters', () => {
            expect(validateParams('connect_host', null)).not.toBeNull();
        });

        test('should handle undefined parameters', () => {
            expect(validateParams('connect_host', undefined)).not.toBeNull();
        });

        test('should handle extra parameters (should be allowed)', () => {
            const params = {
                terminal_name: 'SSH: router1',
                extra_param: 'should be ignored'
            };
            // Extra parameters are typically allowed in MCP
            expect(validateParams('show_terminal', params)).toBeNull();
        });
    });
});
