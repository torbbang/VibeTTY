# VibeTTY

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/torbbang/vibetty)
[![License](https://img.shields.io/badge/license-SEE%20LICENSE-green.svg)](LICENSE.txt)

**AI-assisted SSH/Telnet/Serial management in VSCode**

VSCode extension + MCP server for managing remote infrastructure with AI assistance.

🔗 **[GitHub Repository](https://github.com/torbbang/vibetty)** | 🐛 **[Report Issues](https://github.com/torbbang/vibetty/issues)**

---
## ⚠️ VIBECODED PROTOTYPE ⚠️

The code quality of this project is abysmal and security is mostly left to chance.  
I would strongly advise against using VibeTTY in production environments.

---

## 🚀 Quick Start

### 1. Install

**From VSIX:**
```bash
# Download .vsix from releases or build from source
# Install: Extensions → `...` → Install from VSIX
```

**Build from Source:**
```bash
git clone https://github.com/torbbang/vibetty.git
cd vibetty
npm install && npm run compile
vsce package
```

### 2. Add Connections

1. Open VibeTTY sidebar
2. Click `+` → Choose SSH/Telnet/Serial
3. Fill in details → Connect

### 3. Setup MCP

MCP enables AI assistants (Claude Code, Cline, etc.) to interact with VibeTTY.

**Automatic:** Command Palette → `VibeTTY: Configure MCP Client`

**Manual:** Add to MCP client config:
```json
{
  "mcpServers": {
    "vibetty": {
      "command": "node",
      "args": ["/path/to/vscode-vibetty/out/mcp/cli.js"]
    }
  }
}
```

For the best user experience I recommend auto-approving the following tools:
- list_connections
- list_active_sessions
- show_terminal
- read_output
- auto_paginate
- set_device_type

## ✨ Features

**Connections:**
- SSH/Telnet/Serial with ProxyJump, port forwarding, keep-alive
- Multiple concurrent sessions per host
- Folder organization with drag-and-drop
- Persistent terminals (don't close on disconnect)

**AI Integration (MCP):**
- 8 MCP tools for Claude Code, Cline, Gemini, etc.
- List/connect/command/read output with approval gates
- Auto-pagination through `--More--` prompts
- Device type detection (Cisco IOS/IOS-XE, Juniper Junos, FortiOS)

**Security:**
- 50+ secret filtering patterns (passwords, SNMP, BGP keys, etc.)
- Strict Mode: manual approval for all AI commands
- Edit-before-submit approval dialogs
- Localhost-only MCP server with token auth

**UX:**
- SecureCRT-compatible keyword highlighting
- Auto-focus on password prompts
- Session logging with daily rotation
- Connection notes for device documentation

## 🛠️ MCP Tools

| Tool | Description | Approval |
|------|-------------|----------|
| `list_connections` | List configured devices with status | Auto |
| `connect_host` | Open connections, returns session_id | Auto |
| `show_terminal` | Focus terminal window | Auto |
| `send_to_terminal` | Execute commands | **Required** |
| `read_output` | Read output (secrets filtered) | **Strict Mode** |
| `update_connection_notes` | Update device notes | Auto |
| `auto_paginate` | Enable auto-pagination | Auto |
| `set_device_type` | Set device type | Auto |

## ⚙️ Configuration

### VSCode Settings

Access via: Settings → Extensions → VibeTTY

```json
{
  // ===== Security =====
  "vibetty.security.strictMode": false,  // Require manual approval for LLM commands/output

  // ===== Session Logging =====
  "vibetty.logging.enabled": false,  // Global logging toggle (per-connection override available)
  "vibetty.logging.directory": "~/.vibetty/logs",  // Log directory (supports ~ expansion)

  // ===== SSH Keep-Alive =====
  "vibetty.ssh.serverAliveInterval": 60,  // Seconds (0 to disable)

  // ===== Keyword Highlighting =====
  "vibetty.highlighting.enabled": true,
  "vibetty.highlighting.customKeywordFile": "~/.vibetty/keywords.ini",  // SecureCRT .ini format

  // ===== Connections =====
  "vibetty.connections": [
    {
      // Basic properties (all connection types)
      "name": "router1",
      "type": "ssh",  // "ssh", "telnet", or "serial"
      "folder": "Production/Core",  // Optional: organize in folders (use / for nesting)

      // SSH properties
      "hostname": "10.0.1.1",
      "port": 22,  // Default: 22
      "user": "admin",
      "identityFile": "~/.ssh/id_rsa",  // Optional: SSH key path
      "proxyJump": "bastion.example.com",  // Optional: jump host

      // Port forwarding (SSH only)
      "localForward": ["8080:localhost:80"],  // Optional: local port forwarding
      "remoteForward": ["9090:localhost:8080"],  // Optional: remote port forwarding
      "dynamicForward": ["1080"],  // Optional: SOCKS proxy

      // Device configuration
      "device_type": "cisco_ios",  // cisco_ios, cisco_ios-xe, juniper_junos, fortinet_fortios, generic
      "notes": "Core router - IOS 15.2(4)E7 - MPLS PE - BGP AS 65001",  // Device documentation

      // Logging override (optional)
      "enableLogging": true  // Override global logging setting for this connection
    },
    {
      // Telnet example
      "name": "switch1",
      "type": "telnet",
      "hostname": "192.168.1.10",
      "port": 23,
      "device_type": "cisco_ios"
    },
    {
      // Serial example
      "name": "console1",
      "type": "serial",
      "device": "/dev/ttyUSB0",  // Serial device path
      "baudRate": 9600,  // Default: 9600
      "device_type": "cisco_ios"
    }
  ]
}
```

## 🔒 Security

**Protection Layers:**
1. **Secret Filtering** - 50+ patterns for Cisco/Juniper/FortiOS (passwords, SNMP, BGP keys, etc.)
2. **Strict Mode** - Manual approval for all AI commands/output (toggle in status bar)
3. **Network Isolation** - Localhost-only MCP server with token auth (port 47632)
4. **File Permissions** - Session logs and auth token stored with 0600 (owner-only)

**Limitations:**
- Pattern-based filtering may miss uncommon secret formats
- Session logs contain unfiltered output (user responsibility to secure)
- Connection notes stored in plaintext VSCode settings