import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface MCPConfig {
    mcpServers?: Record<string, unknown>;
    mcp_servers?: Record<string, unknown>;
}

export interface ConfigStatus {
    claudeCode: boolean;
    cline: boolean;
    gemini: boolean;
    mistralVibe: boolean;
    configPaths: string[];
}

export function checkMCPConfigs(): ConfigStatus {
    const status: ConfigStatus = {
        claudeCode: false,
        cline: false,
        gemini: false,
        mistralVibe: false,
        configPaths: []
    };

    // Check Claude Code config (uses ~/.claude.json for user scope)
    const claudeCodeConfigPaths = [
        path.join(os.homedir(), '.claude.json')
    ];

    for (const configPath of claudeCodeConfigPaths) {
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content) as MCPConfig;
                if (config.mcpServers && 'vibetty' in config.mcpServers) {
                    status.claudeCode = true;
                    status.configPaths.push(configPath);
                }
            } catch {
                // Config exists but couldn't be parsed
            }
        }
    }

    // Check Cline config (VSCode global storage location)
    const clineConfigPaths = [
        // Linux/macOS XDG config
        path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        // macOS/Linux legacy location
        path.join(os.homedir(), '.vscode', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        // Windows
        path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        // VSCode Insiders variants
        path.join(os.homedir(), '.config', 'Code - Insiders', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code - Insiders', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')
    ];

    for (const configPath of clineConfigPaths) {
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content) as MCPConfig;
                if (config.mcpServers && 'vibetty' in config.mcpServers) {
                    status.cline = true;
                    status.configPaths.push(configPath);
                }
            } catch {
                // Config exists but couldn't be parsed
            }
        }
    }

    // Check Gemini config
    const geminiConfigPaths = [
        path.join(os.homedir(), '.gemini', 'settings.json')
    ];

    for (const configPath of geminiConfigPaths) {
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content) as MCPConfig;
                if (config.mcpServers && 'vibetty' in config.mcpServers) {
                    status.gemini = true;
                    status.configPaths.push(configPath);
                }
            } catch {
                // Config exists but couldn't be parsed
            }
        }
    }

    // Check Mistral Vibe CLI config (TOML format)
    const mistralVibeConfigPaths = [
        path.join(os.homedir(), '.vibe', 'config.toml'),
        path.join(os.homedir(), '.config', 'vibe', 'config.toml')
    ];

    for (const configPath of mistralVibeConfigPaths) {
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                // Simple string-based check for vibetty configuration
                // Looks for TOML table with name = "vibetty"
                if (content.includes('name = "vibetty"')) {
                    status.mistralVibe = true;
                    status.configPaths.push(configPath);
                }
            } catch {
                // Config exists but couldn't be read
            }
        }
    }

    return status;
}

export function generateConfigSnippet(client?: 'claude-code' | 'cline' | 'gemini' | 'mistral-vibe'): string {
    const cliPath = path.join(__dirname, '..', 'mcp', 'cli.js');
    const absolutePath = path.resolve(cliPath);

    if (client === 'mistral-vibe') {
        // Mistral Vibe CLI uses TOML format with tool permissions
        return `[[mcp_servers]]
name = "vibetty"
transport = "stdio"
command = "node"
args = ["${absolutePath}"]

# Auto-approve read-only VibeTTY tools
[tools.vibetty_list_connections]
permission = "always"

[tools.vibetty_get_connection]
permission = "always"

[tools.vibetty_show_terminal]
permission = "always"

[tools.vibetty_read_output]
permission = "always"

[tools.vibetty_auto_paginate]
permission = "always"

[tools.vibetty_set_device_type]
permission = "always"

# Ask for approval on write operations
[tools.vibetty_connect_host]
permission = "ask"

[tools.vibetty_send_to_terminal]
permission = "ask"

[tools.vibetty_update_connection_notes]
permission = "ask"

[tools.vibetty_add_connection]
permission = "ask"

[tools.vibetty_edit_connection]
permission = "ask"`;
    }

    // Default configuration for other clients (Claude Code, Cline, Gemini)
    return JSON.stringify({
        mcpServers: {
            vibetty: {
                type: 'stdio',
                command: 'node',
                args: [absolutePath],
                toolPermissions: {
                    autoApprove: [
                        'list_connections',
                        'list_active_sessions',
                        'show_terminal',
                        'read_output',
                        'auto_paginate',
                        'set_device_type'
                    ],
                    alwaysAsk: [
                        'connect_host',
                        'send_to_terminal'
                    ]
                }
            }
        }
    }, null, 2);
}

export interface ConfigUpdate {
    path: string;
    client: string;
    currentContent: string;
    newContent: string;
}

function getClineConfigPath(): string {
    // Try to find existing Cline config, or use default location
    const possiblePaths = [
        // Linux/macOS XDG config
        path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        // macOS/Linux legacy location
        path.join(os.homedir(), '.vscode', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        // Windows
        path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        // VSCode Insiders variants
        path.join(os.homedir(), '.config', 'Code - Insiders', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
        path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code - Insiders', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')
    ];

    // Return first existing path, or default to the most common location
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // Default to XDG config on Linux/macOS, APPDATA on Windows
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
    } else {
        return path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
    }
}

function getMistralVibeConfigPath(): string {
    // Try to find existing Mistral Vibe CLI config, or use default location
    const possiblePaths = [
        path.join(os.homedir(), '.vibe', 'config.toml'),
        path.join(os.homedir(), '.config', 'vibe', 'config.toml')
    ];

    // Return first existing path, or default to the most common location
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // Default to XDG config on Linux/macOS, home directory on Windows
    if (process.platform === 'win32') {
        return path.join(os.homedir(), '.vibe', 'config.toml');
    } else {
        return path.join(os.homedir(), '.config', 'vibe', 'config.toml');
    }
}

export function getConfigUpdateProposal(client: 'claude-code' | 'cline' | 'gemini' | 'mistral-vibe'): ConfigUpdate | null {
    interface VibeTTYConfig {
        type?: string;
        command: string;
        args: string[];
        autoApprove?: string[];
        alwaysAllow?: string[];
        toolPermissions?: {
            autoApprove?: string[];
            alwaysAllow?: string[];
            alwaysAsk?: string[];
        };
        permissions?: {
            auto_approve?: string[];
            require_approval?: string[];
        };
    }

    const cliPath = path.join(__dirname, '..', 'mcp', 'cli.js');
    const absolutePath = path.resolve(cliPath);

    let vibettyConfig: VibeTTYConfig;
    let configPath: string;
    let clientName: string;

    if (client === 'mistral-vibe') {
        configPath = getMistralVibeConfigPath();
        clientName = 'Mistral Vibe CLI';
        // Mistral Vibe CLI uses TOML format with tool permissions
        // MCP tools are prefixed with server name: vibetty_{tool_name}
        const tomlSnippet = `[[mcp_servers]]
name = "vibetty"
transport = "stdio"
command = "node"
args = ["${absolutePath}"]

# Auto-approve read-only VibeTTY tools
[tools.vibetty_list_connections]
permission = "always"

[tools.vibetty_get_connection]
permission = "always"

[tools.vibetty_show_terminal]
permission = "always"

[tools.vibetty_read_output]
permission = "always"

[tools.vibetty_auto_paginate]
permission = "always"

[tools.vibetty_set_device_type]
permission = "always"

# Ask for approval on write operations
[tools.vibetty_connect_host]
permission = "ask"

[tools.vibetty_send_to_terminal]
permission = "ask"

[tools.vibetty_update_connection_notes]
permission = "ask"

[tools.vibetty_add_connection]
permission = "ask"

[tools.vibetty_edit_connection]
permission = "ask"`;

        // For Mistral Vibe CLI, we'll return the TOML snippet directly
        // Default to a comment to avoid empty diff content
        let currentContent = '# Mistral Vibe CLI configuration\n';

        if (fs.existsSync(configPath)) {
            try {
                const fileContent = fs.readFileSync(configPath, 'utf-8');
                if (fileContent.trim()) {
                    currentContent = fileContent;
                }
            } catch {
                // Invalid TOML, use default
            }
        } else {
            // Ensure directory exists for new config files
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // For TOML, we need to append the MCP server configuration
        let newContent = currentContent;
        if (!currentContent.includes('name = "vibetty"')) {
            // Add the vibetty server configuration
            if (newContent && !newContent.endsWith('\n')) {
                newContent += '\n\n';
            }
            newContent += tomlSnippet;
        }

        return {
            path: configPath,
            client: clientName,
            currentContent,
            newContent
        };
    } else if (client === 'cline') {
        configPath = getClineConfigPath();
        clientName = 'Cline';
        // Cline uses a flat structure for tool permissions.
        vibettyConfig = {
            type: 'stdio',
            command: 'node',
            args: [absolutePath],
            autoApprove: [
                'list_connections',
                'list_active_sessions',
                'show_terminal',
                'read_output',
                'auto_paginate',
                'set_device_type'
            ]
        };
    } else {
        clientName = client === 'claude-code' ? 'Claude Code' : 'Gemini';
        configPath = client === 'claude-code'
            ? path.join(os.homedir(), '.claude.json')
            : path.join(os.homedir(), '.gemini', 'settings.json');

        // Claude Code and Gemini share the same nested toolPermissions structure.
        vibettyConfig = {
            type: 'stdio',
            command: 'node',
            args: [absolutePath],
            toolPermissions: {
                autoApprove: [
                    'list_connections',
                    'list_active_sessions',
                    'show_terminal',
                    'read_output',
                    'auto_paginate',
                    'set_device_type'
                ],
                alwaysAsk: [
                    'connect_host',
                    'send_to_terminal'
                ]
            }
        };
    }

    let currentContent = '{}';
    let config: MCPConfig = {};

    if (fs.existsSync(configPath)) {
        try {
            currentContent = fs.readFileSync(configPath, 'utf-8');
            config = JSON.parse(currentContent);
        } catch {
            // Invalid JSON, start fresh
            config = {};
        }
    } else {
        // Ensure directory exists for new config files
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Add or update vibetty server configuration
    if (!config.mcpServers) {
        config.mcpServers = {};
    }
    config.mcpServers.vibetty = vibettyConfig;

    const newContent = JSON.stringify(config, null, 2);

    return {
        path: configPath,
        client: clientName,
        currentContent,
        newContent
    };
}

export function applyConfigUpdate(update: ConfigUpdate): void {
    fs.writeFileSync(update.path, update.newContent, 'utf-8');
}
