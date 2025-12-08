/**
 * MCP Tool Definitions
 * Defines all available tools for the VibeTTY MCP server
 */

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties?: Record<string, unknown>;
        required?: string[];
    };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: 'list_connections',
        description: 'List all configured SSH/Telnet/Serial connections with their current status (active terminals, subsessions, device context). Shows connection notes automatically.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'connect_host',
        description: 'Open a new SSH/Telnet/Serial terminal connection. Can connect to multiple hosts at once. Automatically displays connection notes if available. Returns terminal names and session IDs - IMPORTANT: Use the session_id (not terminal name) when calling other tools to avoid ambiguity when multiple sessions exist for the same device.',
        inputSchema: {
            type: 'object',
            properties: {
                host_names: {
                    type: 'array',
                    description: 'Array of connection names to connect to (from list_connections)',
                    items: {
                        type: 'string'
                    }
                }
            },
            required: ['host_names']
        }
    },
    {
        name: 'send_to_terminal',
        description: 'Send one or more commands to an active terminal session. Use this tool to execute commands on existing sessions (much preferred over creating new connections). By default, each command is sent with a newline appended. Set add_newline to false for sending text without automatic newlines (e.g., for pagination prompts). IMPORTANT: Always call `show_terminal` BEFORE using this tool to display the terminal window to the user - this provides transparency and allows monitoring of command execution. CRITICAL: Before sending commands that could alter the system\'s state (e.g., reloading, changing network settings, modifying user accounts), always ask the user for confirmation and explain the potential consequences. Before suggesting a command that modifies the system, consider using read-only tools like `read_output` or `list_connections` to gather more context and verify the current state. This will help you make more informed and safer suggestions.',
        inputSchema: {
            type: 'object',
            properties: {
                terminal_name: {
                    type: 'string',
                    description: 'Terminal identifier: PREFER using the session_id from connect_host or list_connections. You can also use the terminal name (e.g., "SSH: router1"), but session_id is required when multiple sessions exist for the same device to avoid ambiguity.'
                },
                commands: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Array of commands to send. Examples: ["show version"] for single command, or ["configure terminal", "interface GigabitEthernet0/1", "description Uplink", "exit"] for config block.'
                },
                add_newline: {
                    type: 'boolean',
                    description: 'If true (default), a newline is appended after each command. Set to false for pagination prompts or when you need precise control.',
                    default: true
                }
            },
            required: ['terminal_name', 'commands']
        }
    },
    {
        name: 'read_output',
        description: 'Read terminal output. Returns output with secrets filtered (passwords, keys, etc.). Pagination prompts are automatically removed.',
        inputSchema: {
            type: 'object',
            properties: {
                terminal_name: {
                    type: 'string',
                    description: 'Terminal identifier: PREFER using the session_id from connect_host or list_connections. You can also use the terminal name, but session_id is required when multiple sessions exist for the same device to avoid ambiguity.'
                },
                lines: {
                    type: 'number',
                    description: 'Optional: number of recent lines to return. If omitted, returns only new output since last read.'
                }
            },
            required: ['terminal_name']
        }
    },
    {
        name: 'show_terminal',
        description: 'Focus/show a terminal in the UI',
        inputSchema: {
            type: 'object',
            properties: {
                terminal_name: {
                    type: 'string',
                    description: 'Terminal identifier: PREFER using the session_id from connect_host or list_connections. You can also use the terminal name, but session_id is required when multiple sessions exist for the same device to avoid ambiguity.'
                }
            },
            required: ['terminal_name']
        }
    },
    {
        name: 'update_connection_notes',
        description: 'Update notes/documentation for a connection. Notes are shown when connecting and help track device state. KEEP NOTES CONCISE - document static config only (hardware, OS version, role, interface assignments). DO NOT document operational state (uptime, interface status, bandwidth stats).',
        inputSchema: {
            type: 'object',
            properties: {
                connection_name: {
                    type: 'string',
                    description: 'Name of the connection'
                },
                notes: {
                    type: 'string',
                    description: 'Notes/context about the device (static config only, not operational state)'
                }
            },
            required: ['connection_name', 'notes']
        }
    },
    {
        name: 'auto_paginate',
        description: 'Enable auto-pagination for the next command. When enabled, VibeTTY will automatically send space to continue through pagination prompts (--More--, etc.).',
        inputSchema: {
            type: 'object',
            properties: {
                terminal_name: {
                    type: 'string',
                    description: 'Terminal identifier: PREFER using the session_id from connect_host or list_connections. You can also use the terminal name, but session_id is required when multiple sessions exist for the same device to avoid ambiguity.'
                },
                enabled: {
                    type: 'boolean',
                    description: 'Enable or disable auto-pagination',
                    default: true
                }
            },
            required: ['terminal_name']
        }
    },
    {
        name: 'set_device_type',
        description: 'Manually set the device type for a terminal session. Use this if auto-detection fails or to override detected type. Persists the device type in settings for future connections.',
        inputSchema: {
            type: 'object',
            properties: {
                terminal_name: {
                    type: 'string',
                    description: 'Terminal identifier: PREFER using the session_id from connect_host or list_connections. You can also use the terminal name, but session_id is required when multiple sessions exist for the same device to avoid ambiguity.'
                },
                device_type: {
                    type: 'string',
                    description: 'Device type (currently implemented: cisco_ios, cisco_ios-xe, juniper_junos, fortinet_fortios, generic)',
                    enum: [
                        'cisco_ios',
                        'cisco_ios-xe',
                        'juniper_junos',
                        'fortinet_fortios',
                        'generic'
                    ]
                }
            },
            required: ['terminal_name', 'device_type']
        }
    }
];
