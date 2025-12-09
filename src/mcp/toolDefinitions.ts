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
        description: 'Override device type for an ACTIVE terminal session with immediate effect. Also persists to connection settings if found. Use this when auto-detection got it wrong for a currently running session. For configuration-only changes (no active session), use edit_connection instead.',
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
    },
    {
        name: 'add_connection',
        description: 'Add a new SSH/Telnet/Serial connection to VibeTTY settings. The connection will be saved and available for future use. Supports all connection properties including SSH port forwarding, proxy jump, and device-specific settings.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Unique name for this connection (required)'
                },
                type: {
                    type: 'string',
                    description: 'Connection type (required)',
                    enum: ['ssh', 'telnet', 'serial']
                },
                hostname: {
                    type: 'string',
                    description: 'Hostname or IP address (required for SSH and Telnet)'
                },
                port: {
                    type: 'number',
                    description: 'Port number (optional, defaults: SSH=22, Telnet=23). Must be 1-65535.'
                },
                user: {
                    type: 'string',
                    description: 'Username for SSH connections (optional)'
                },
                device: {
                    type: 'string',
                    description: 'Device path for serial connections (required for serial, e.g., /dev/ttyUSB0)'
                },
                baud: {
                    type: 'number',
                    description: 'Baud rate for serial connections (optional, default: 9600). Common values: 9600, 19200, 38400, 57600, 115200.'
                },
                folder: {
                    type: 'string',
                    description: 'Folder/group name for organizing connections in the sidebar (optional)'
                },
                device_type: {
                    type: 'string',
                    description: 'Device type for vendor-specific features (optional, default: generic)',
                    enum: ['cisco_ios', 'cisco_ios-xe', 'juniper_junos', 'fortinet_fortios', 'generic']
                },
                notes: {
                    type: 'string',
                    description: 'Connection notes/documentation (optional, max 10KB). Should contain static config info only.'
                },
                enableLogging: {
                    type: 'boolean',
                    description: 'Enable session logging for this connection (optional, overrides global setting)'
                },
                proxyJump: {
                    type: 'string',
                    description: 'SSH ProxyJump/bastion host (optional, SSH only, e.g., "user@jumphost")'
                },
                proxyCommand: {
                    type: 'string',
                    description: 'SSH ProxyCommand (optional, SSH only, e.g., "ssh -W %h:%p jumphost")'
                },
                identityFile: {
                    type: 'string',
                    description: 'SSH private key file path (optional, SSH only, e.g., "~/.ssh/id_rsa")'
                },
                localForward: {
                    type: 'array',
                    description: 'SSH local port forwarding rules (optional, SSH only, e.g., ["8080:localhost:80"])',
                    items: {
                        type: 'string'
                    }
                },
                remoteForward: {
                    type: 'array',
                    description: 'SSH remote port forwarding rules (optional, SSH only, e.g., ["8080:localhost:80"])',
                    items: {
                        type: 'string'
                    }
                },
                dynamicForward: {
                    type: 'array',
                    description: 'SSH dynamic port forwarding (SOCKS proxy) ports (optional, SSH only, e.g., ["1080"])',
                    items: {
                        type: 'string'
                    }
                },
                serverAliveInterval: {
                    type: 'number',
                    description: 'SSH ServerAliveInterval in seconds (optional, SSH only, keeps connection alive)'
                },
                connectTimeout: {
                    type: 'number',
                    description: 'SSH connection timeout in seconds (optional, SSH only, default: 10)'
                }
            },
            required: ['name', 'type']
        }
    },
    {
        name: 'get_connection',
        description: 'Get detailed information about a specific connection. Returns all configured properties in a readable format.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the connection to retrieve (required)'
                }
            },
            required: ['name']
        }
    },
    {
        name: 'edit_connection',
        description: 'Edit an existing SSH/Telnet/Serial connection in VibeTTY settings. Only provided properties will be updated; omitted properties remain unchanged. Cannot change connection type. Changes take effect for new sessions only.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the connection to edit (required)'
                },
                hostname: {
                    type: 'string',
                    description: 'Hostname or IP address (for SSH and Telnet)'
                },
                port: {
                    type: 'number',
                    description: 'Port number (must be 1-65535)'
                },
                user: {
                    type: 'string',
                    description: 'Username (SSH only)'
                },
                device: {
                    type: 'string',
                    description: 'Serial device path (Serial only)'
                },
                baud: {
                    type: 'number',
                    description: 'Baud rate (Serial only)'
                },
                folder: {
                    type: 'string',
                    description: 'Folder/group name for organizing connections'
                },
                device_type: {
                    type: 'string',
                    description: 'Device type for vendor-specific features',
                    enum: ['cisco_ios', 'cisco_ios-xe', 'juniper_junos', 'fortinet_fortios', 'generic']
                },
                notes: {
                    type: 'string',
                    description: 'Connection notes/documentation (max 10KB)'
                },
                enableLogging: {
                    type: 'boolean',
                    description: 'Enable session logging for this connection'
                },
                proxyJump: {
                    type: 'string',
                    description: 'SSH ProxyJump/bastion host (SSH only)'
                },
                proxyCommand: {
                    type: 'string',
                    description: 'SSH ProxyCommand (SSH only)'
                },
                identityFile: {
                    type: 'string',
                    description: 'SSH private key file path (SSH only)'
                },
                localForward: {
                    type: 'array',
                    description: 'SSH local port forwarding rules (SSH only)',
                    items: {
                        type: 'string'
                    }
                },
                remoteForward: {
                    type: 'array',
                    description: 'SSH remote port forwarding rules (SSH only)',
                    items: {
                        type: 'string'
                    }
                },
                dynamicForward: {
                    type: 'array',
                    description: 'SSH dynamic port forwarding (SOCKS proxy) ports (SSH only)',
                    items: {
                        type: 'string'
                    }
                },
                serverAliveInterval: {
                    type: 'number',
                    description: 'SSH ServerAliveInterval in seconds (SSH only)'
                },
                connectTimeout: {
                    type: 'number',
                    description: 'SSH connection timeout in seconds (SSH only)'
                }
            },
            required: ['name']
        }
    }
];
