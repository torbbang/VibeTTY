# VibeTTY

Utilize LLMs to improve & speed up your existing workflows.  
VibeTTY is a vscode extension and MCP server that lets you use vscode as your terminal emulator

---

## ⚠️ Security Notice - Preview Release ⚠️

VibeTTY is currently in **preview/beta** status. While significant security hardening has been implemented (encryption, input validation, secret filtering), this extension:

- **Has zero test coverage** - No automated tests yet
- **Logs contain raw output** - Session logs are NOT redacted (user responsibility to secure)
- **Stores auth tokens locally** - MCP auth token in `~/.vibetty/mcp_token` (0600 permissions)
- **Requires user approval in Strict Mode** - All AI commands require manual approval when enabled
- **Has not undergone external security audit**

**Recommendations:**
- **Enable Strict Mode** when working with production systems (off by default - see settings)
- Keep session logs secure - they contain unfiltered terminal output
- Use in lab/dev environments until v1.0 stable release
- Review the [Security Best Practices](#security-best-practices) section below

---

## 🚀 Quick Start

### 1. Install
Install from VSIX or build from source:
```bash
git clone https://github.com/torbbang/vibetty.git
cd vibetty
npm install
npm run compile
vsce package  # Creates .vsix
```
Install VSIX: Extensions → `...` → Install from VSIX

Dev mode: Press `F5` in VSCode

### 2. Add Connections
1. Open VibeTTY sidebar
2. Click `+` button
3. Choose SSH/Telnet/Serial
4. Fill in details, click to connect

### 3. Setup MCP (Optional)

**Automatic**: 

Command Palette → `VibeTTY: Configure MCP Client`

**Manual** (add to your MCP client config):
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

Recommended auto-approve tools (for better UX, our config generator does this):
- `list_connections`, `show_terminal`, `auto_paginate`, `set_device_type`

Note: `read_output` still requires approval when Strict Mode is enabled.

## ✨ Features

- **SSH/Telnet/Serial** connections (serial requires `screen` command)
- **ProxyJump**, **port forwarding** (local/remote/dynamic), **keep-alive**
- **Folder organization** with drag-and-drop
- **Multiple sessions** per host
- **Connection notes** (shown when AI connects)
- **AI integration** via MCP (Claude Code, Cline, Gemini)
  - List/connect to devices
  - Execute commands, read output
  - Auto-paginate through `--More--` prompts
  - Update connection notes
  - Device type config (Cisco IOS/IOS-XE, Juniper Junos, FortiOS, Generic)
- **Strict Mode**: approve command execution and output reads
- **Secret filtering** (pattern-based: passwords, hashes, keys)
- **Session logging** with daily rotation (raw output, no filtering)
- **Keyword highlighting** (SecureCRT-compatible, requires user-provided file)

## 🛠️ MCP Tools

| Tool | Description | Approval |
|------|-------------|----------|
| `list_connections` | List devices | Auto |
| `connect_host` | Open connection(s) | Auto |
| `read_output` | Read output (secrets filtered) | **Strict Mode** |
| `show_terminal` | Focus terminal | Auto |
| `send_to_terminal` | Execute commands | **Required** |
| `update_connection_notes` | Update notes | Auto |
| `auto_paginate` | Navigate pagination | Auto |
| `set_device_type` | Set device type | Auto |

## ⚙️ Configuration

```json
{
  // Security
  "vibetty.security.strictMode": false,  // Require approval for commands/output

  // Logging
  "vibetty.logging.enabled": false,
  "vibetty.logging.directory": "~/.vibetty/logs",

  // SSH
  "vibetty.ssh.serverAliveInterval": 60,  // Keep-alive in seconds

  // Keyword Highlighting (requires user-provided file)
  "vibetty.highlighting.enabled": true,
  "vibetty.highlighting.customKeywordFile": "~/.vibetty/keywords.ini", // Follows SecureCRT highlight format

  // Connections
  "vibetty.connections": [
    {
      "name": "router1",
      "type": "ssh",              // ssh, telnet, or serial
      "hostname": "10.0.1.1",
      "port": 22,
      "user": "admin",
      "folder": "Production/Core",  // Optional: organize in folders
      "device_type": "cisco_ios",   // cisco_ios, cisco_ios-xe, juniper_junos, fortinet_fortios, generic
      "enableLogging": true,        // Optional: per-connection logging override
      "notes": "Core router - IOS 15.2 - MPLS/BGP"  // Shown when AI connects
    }
  ]
}
```

## 🔒 Security

### Protection Mechanisms

**Secret Filtering** (always on)
- Detects passwords, hashes, community strings, encryption keys in terminal output
- Replaces with placeholders (`<REDACTED_SECRET_1>`) before sending to LLM
- Vendor-aware patterns: Cisco, Juniper, FortiOS, + generic fallbacks
- In-memory only (secrets cleared on extension reload)

**Strict Mode** (off by default)
- **Commands**: `send_to_terminal` requires approval
- **Output**: `read_output` requires approval before sending to LLM
- Edit-before-approve supported
- Read-only tools (list, connect, show terminal, etc.) bypass approval

**Network Isolation**
- MCP server: localhost only, port 47632, token auth
- No outbound connections from extension

### Security Best Practices

When using VibeTTY with sensitive systems:

1. **Enable Strict Mode** (Settings → VibeTTY → Security → Strict Mode)
   - Forces manual approval for all AI-initiated commands
   - Review commands before execution

2. **Secure Your Logs**
   - Session logs contain unfiltered terminal output
   - Default location: configured in settings
   - Logs have 0600 permissions (owner-only read/write)
   - Review and delete logs containing sensitive data

3. **Connection Notes**
   - Keep notes concise and non-sensitive
   - Stored in VSCode settings (not encrypted)
   - AI assistants can read connection notes

4. **MCP Authentication**
   - Auth token stored in `~/.vibetty/mcp_token` (0600 permissions)
   - Persistent across restarts (reused if valid)
   - Only accessible from localhost

5. **Secret Filtering**
   - Passwords, keys, and community strings are filtered before sending to AI
   - Pattern-based detection may miss uncommon formats
   - Review output before sharing with AI assistants

### Known Limitations

- **Pattern-based secret filtering** - May miss uncommon secret formats or new vendors
- **Secret storage** - Encrypted with machine-derived key (AES-256-CBC), decrypted on-demand for restoration
- **Zero test coverage** - No automated security testing yet
- **No external audit** - Has not been reviewed by security professionals

---

## 🛠️ Development & Publishing

### Building from Source

```bash
git clone https://github.com/torbbang/vibetty.git
cd vibetty
npm install
npm run compile
```

### Publishing to VSCode Marketplace

**Automated (Recommended):**

Publishing is automated via GitHub Actions:

1. **Automatic on merge to main:**
   - CI workflow runs (lint, compile, test)
   - If CI passes, CD workflow publishes to marketplace
   - Uses version from `package.json`

2. **Manual trigger:**
   - Go to Actions → "Publish to VSCode Marketplace" → "Run workflow"
   - Specify version (e.g., `0.2.0`)
   - Publishes immediately (bypasses CI check)

**Setup Required:**

Create a Personal Access Token (PAT) for the VSCode Marketplace:

1. Go to https://dev.azure.com/{your-org}/_usersSettings/tokens
2. Create new token with **Marketplace (Manage)** scope
3. Add as GitHub repository secret: `VSCE_PAT`
4. GitHub Settings → Secrets and variables → Actions → New repository secret

**Manual Publishing:**

```bash
# Update version in package.json
npm version patch  # or minor, major

# Package extension
npx vsce package

# Publish to marketplace
npx vsce publish -p YOUR_PAT_TOKEN
```

### CI/CD Workflows

- **CI** (`.github/workflows/ci.yml`): Runs on all branches
  - Linting, compilation, tests
  - Packages VSIX artifact

- **CD** (`.github/workflows/publish.yml`): Runs after CI succeeds on main/master
  - Publishes to VSCode Marketplace
  - Creates git tag for the version
  - Uploads VSIX as artifact