# VibeTTY Development Guidelines

## What is VibeTTY?

VibeTTY applies **VibeOps practices** to network and systems administration. Just as vibe coding transforms software development with AI-assisted workflows, VibeTTY enables the same fluid, AI-collaborative experience for managing remote infrastructure.

**VibeOps practices** = Applying vibe coding principles to infrastructure management
**VibeTTY** = Terminal/SSH tool using VibeOps practices (SSH/Telnet/Serial with MCP integration)

## Core Principles

- **TypeScript only** - Minimal, readable code
- **No third-party libraries** - Use Node.js and VSCode APIs exclusively
- **Safety first** - Never auto-execute commands, always require user approval
- **Simplicity** - Fewer abstractions, direct implementations
- **AI-first design** - Built for collaboration with AI assistants via MCP

## Architecture

VSCode extension with:
- Extension host (main logic)
- MCP server (IPC on port 47632)
- Terminal API (SSH sessions via custom pseudoterminal)
- TreeView (session sidebar)

## File Structure

```
src/
  extension.ts           # Entry point, command registration
  sessions/
    connections.ts       # Connection type definitions and settings management
    sessionManager.ts    # Track active connections, logging
    sessionLogger.ts     # Session logging with daily rotation
  terminal/
    sshPseudoterminal.ts # Custom PTY with output capture, password detection
    visualHighlighter.ts # Terminal output highlighting and blinking
    bufferManager.ts     # Output buffer management with memory limits
    deviceDetection.ts   # Automatic device type detection
    inputProcessor.ts    # Terminal input handling and processing
    paginationHandler.ts # Auto-pagination for --More-- prompts
    passwordDetector.ts  # Password prompt detection
    terminalOutputProcessor.ts # Terminal control sequence processing
  settings/
    hostSettingsPanel.ts # Webview for editing SSH host properties
  sidebar/
    sessionTree.ts       # TreeDataProvider with drag-and-drop
  device-types/
    vendor.ts            # Vendor interface definition
    index.ts             # Device type mapping
    cisco_ios.ts         # Cisco IOS/IOS-XE patterns
    juniper_junos.ts     # Juniper Junos patterns
    fortinet_fortios.ts  # FortiOS patterns
    generic.ts           # Generic patterns
  highlighting/
    keywordParser.ts     # SecureCRT-compatible keyword file parser
    keywordHighlighter.ts # ANSI color highlighting
  security/
    approvalGate.ts      # Strict mode approval system
    passwordFilter.ts    # Secret filtering for LLM
    secretRegistry.ts    # Track filtered secrets
  ui/
    approvalDialog.ts    # Multi-line content approval UI
    statusBar.ts         # Security status indicator
    onboarding.ts        # First-run tutorial
  mcp/
    server.ts            # MCP server implementation
    toolDefinitions.ts   # MCP tool schemas and definitions
    ipcServer.ts         # IPC bridge for external clients
    transport.ts         # IPC transport layer
    configChecker.ts     # Auto-detect and configure MCP clients
    cli.ts               # stdio-to-IPC bridge
  utils/
    outputChannel.ts     # VSCode output channel for logging
    sshValidator.ts      # SSH connection settings validation
```

## Security Rules

- NEVER execute commands without explicit user approval (unless Strict Mode is disabled)
- NEVER store credentials in extension state
- Logs contain raw output (no secret redaction) - user responsibility
- Always show user what will be executed before execution (in Strict Mode)
- Filter secrets before sending to LLM (via password filter)

## Implementation Notes

- Use custom Pseudoterminal for full I/O control
- All LLM actions go through ApprovalGate when Strict Mode enabled
- Terminal highlighting is visual-only (doesn't affect logs or LLM input)
- Session logging is opt-in, no secret filtering in logs

## Terminal Implementation

**Custom Pseudoterminal with full I/O control**

We use VSCode's Pseudoterminal API with Node.js `child_process` to:
- ✅ Capture all terminal output in real-time
- ✅ Detect password prompts automatically
- ✅ Provide output to AI assistants via `read_output` tool
- ✅ Automatically give focus when password is needed
- ✅ Parse command results and errors
- ✅ Apply keyword highlighting (visual only)
- ✅ Log raw output when enabled

**How it works:**
1. SSH spawned as child process (`child_process.spawn`)
2. stdout/stderr captured to output buffer
3. Keyword highlighting applied (if configured)
4. Output displayed in VSCode terminal via Pseudoterminal API
5. Password prompts detected and trigger automatic focus
6. Raw output logged to file (if enabled)
7. MCP tools can read output (with secrets filtered)

**Benefits:**
- No native modules needed (pure TypeScript + Node.js)
- Full terminal output access for AI assistants
- Automatic password prompt detection
- Non-disruptive (only steals focus when actually needed)
- Works with all interactive commands (sudo, enable, ssh, etc.)

## Implemented Features

### Session Management
- **Connection Types**: SSH, Telnet, Serial
- **Folder Organization**: Group connections with drag-and-drop
- **Copy Connections**: Right-click to duplicate connection settings with a new name
- **Multiple Sessions**: Concurrent sessions per connection
- **ProxyJump Support**: Full bastion/jump host support
- **Port Forwarding**: Local, remote, and dynamic (SOCKS)
- **Smart Timeouts**: Fast failure for unreachable hosts (10s default) with separate authentication timeout (30s)
- **Connection Notes**: Persistent device reference documentation for each connection
  - AI assistants automatically see notes when connecting to understand device state
  - AI assistants update notes via `update_connection_notes` MCP tool
  - Stored in VSCode settings, persists across sessions
  - **Keep notes CONCISE**: Document static config, NOT operational state
  - **Include**: hardware model, OS version, role, interface assignments, routing config
  - **Omit**: uptime, interface status, route counts, bandwidth stats (anything transient)
  - Shown automatically when connecting to a device
- **Persistent Terminals**: Terminals remain open when connection fails/ends
  - Displays colored disconnection banner instead of closing
  - Shows exit code, timestamp, and reason for disconnection
  - Yellow banner for normal exit (code 0), red for errors
  - Error notification in bottom-right corner for failed connections
  - User can review output and manually close or reconnect
- **Subsession Detection**: Automatically detects SSH/Telnet/Connect commands
  - Tracks visible command line (handles backspace, Ctrl+U, Ctrl+W, ANSI escapes)
  - Cisco-specific: `connect`, `ssh`, `telnet` with various options
  - Generic: `ssh user@host`, `telnet host`, `ssh -l user host`
  - Detects success (device prompt) vs failure (error messages)
  - Checks failure patterns first to avoid false positives
  - Optional: Save detected subsession as new connection with device type

### Session Logging
- **Raw Output**: No secret redaction in logs (user responsibility)
- **Daily Rotation**: New log file at midnight UTC
- **Timestamped Events**: SESSION_START, SESSION_END, COMMAND
- **Concurrent Sessions**: Unique session IDs (timestamp-random)
- **Configuration**: Global or per-connection override
- **Context Menu**: Enable/disable logging via right-click
- **Log Format**: `hostname-YYYY-MM-DD-sessionId.log`

### Keyword Highlighting
- **SecureCRT Compatible**: Parses .ini and simple formats
- **User-Provided Files**: No bundled keyword files
- **Multi-Vendor**: Single file can contain keywords for all vendors
- **ANSI Colors**: red, green, yellow, blue, magenta, cyan, white
- **Visual Only**: Highlighting doesn't affect logs or LLM input
- **Whole Word Matching**: Case-insensitive by default
- **Configuration**: `vibetty.highlighting.customKeywordFile`

### Security (Strict Mode)
- **Manual Approval**: All LLM interactions require approval via non-blocking notification
- **Non-Blocking UX**: Approval notifications appear in bottom-right, don't grey out or block the editor
- **Multi-line Buffer**: Long content shown in editor for inspection
- **Edit Before Approve**: Modify content before sending
- **Dismissal = Rejection**: Dismissing notification without choosing rejects the request (secure default)
- **Visual Indicator**: Status bar shows Strict Mode state
- **Secret Filtering**: Passwords/keys filtered before LLM (always on)
- **Secret Registry**: Track what was filtered

### Reactive SSH Authentication
- **Prompt detection**: Monitors SSH stdout/stderr for auth prompts in real-time
- **Pattern matching**: Classifies prompts as password, passphrase, or keyboard-interactive
- **VSCode input boxes**: Shows contextual prompts based on auth type
- **Stdin injection**: User responses written directly to SSH stdin
- **Multiple prompts**: Handles sequential prompts (2FA, keyboard-interactive)
- **Security**: Credentials never logged, sent only to SSH stdin, cleared from memory
- **Configuration**: Single toggle (`enableReactiveAuth`) to disable all reactive prompts

#### Prompt Patterns
Located in `sshPseudoterminal.ts`:
- **Password**: `'password:'`, `'password for'`, `'\'s password:'`, `'enter password'`
- **Passphrase**: `'passphrase'`, `'enter passphrase for'`, `'bad passphrase'`
- **Keyboard-interactive**: `'verification code'`, `'token'`, `'otp'`, `'challenge'`, `'authentication code'`

Patterns are case-insensitive and require 300ms stability (no newlines) to trigger.

#### Unified Authentication Experience
- **Initial connection auth**: Reactive input boxes
- **In-session prompts** (sudo, enable, etc.): Same reactive input boxes
- **Host key verification**: Manual terminal input (yes/no)
- **Fallback**: Disable reactive auth to use manual terminal input everywhere

### Auto-Pagination
- **MCP-Only Feature**: Auto-pagination is ONLY enabled for commands sent via MCP `send_to_terminal` tool
  - Manual user commands in the terminal do NOT auto-paginate (user controls pagination manually)
  - This allows users to read through output page-by-page when typing commands themselves
- **Automatic Detection**: Detects vendor-specific pagination prompts during command output
  - Cisco: `' --More-- '` (with spaces)
  - Juniper: `'---\(more\)---'`
  - FortiOS: `'--More--'`
- **Command Queueing**: Commands sent during pagination are automatically queued
- **Space Sending**: Automatically sends space character to continue through pages
- **Prompt Detection**: Stops pagination when device prompt is detected
- **No User Interaction**: Pagination happens transparently in background for MCP commands
- **Important**: ANSI codes are stripped but whitespace is preserved for pattern matching

### Device Detection
- **Automatic Detection**: Analyzes first 5 seconds of terminal output
- **Python/TextFSM**: Uses ntc-templates for accurate parsing
- **Fallback Patterns**: Regex-based detection when ntc-templates unavailable
- **Supported Platforms**: Cisco IOS/NX-OS/IOS-XE/IOS-XR/ASA, Juniper Junos, Arista EOS, Palo Alto PAN-OS, FortiOS, HP Comware/ProCurve, Dell Force10, CheckPoint Gaia, F5, Linux
- **Session Context**: Device info included in `list_connections` output
- **Manual Override**: Use `set_device_type` tool to manually set or override detected type

### MCP Tools
- `list_connections` - List configured connections with status, subsessions, device context, and notes
- `get_connection` - Get detailed information about a specific connection
  - **Readable format**: Returns all configured properties in human-readable format
  - **Complete details**: Shows all connection settings including SSH-specific properties
  - **Includes notes**: Displays connection notes if configured
- `add_connection` - Add a new SSH/Telnet/Serial connection to VibeTTY settings
  - **Supports all connection properties**: hostname, port, user, device, baud, folder, device_type, notes, enableLogging
  - **SSH-specific properties**: proxyJump, proxyCommand, identityFile, localForward, remoteForward, dynamicForward, serverAliveInterval, connectTimeout
  - **Validation**: Checks for duplicate names, validates required fields per connection type, enforces port/baud ranges
  - **Persistence**: Connection is saved to VSCode settings and available immediately
- `edit_connection` - Edit an existing SSH/Telnet/Serial connection
  - **Partial updates**: Only provided properties are updated; omitted properties remain unchanged
  - **Cannot change type**: Connection type (ssh/telnet/serial) cannot be changed after creation
  - **Validation**: Validates updated connection and checks for type compatibility
  - **Changes tracking**: Reports which properties were modified
  - **Note**: Changes take effect for new sessions only; existing sessions continue with previous configuration
- `connect_host` - Open new connection(s) - accepts array of host names (automatically shows notes on connection)
  - **Multiple connections**: Connects sequentially, waiting for each to authenticate before starting the next
  - Prevents authentication prompt conflicts by monitoring connection establishment (30s timeout per host)
  - **Returns**: Terminal name and **session_id** for each connection
  - **IMPORTANT**: Use the returned session_id (not terminal name) when calling other MCP tools to avoid ambiguity when multiple sessions exist
- `send_to_terminal` - Send commands to active terminal (with approval in Strict Mode)
  - **IMPORTANT**: Always call `show_terminal` BEFORE sending commands to provide transparency
  - **Terminal identifier**: PREFER session_id from `connect_host` or `list_connections`. Terminal name works but session_id required when multiple sessions exist
- `read_output` - Read terminal output (with secret filtering, pagination prompts removed)
  - **Terminal identifier**: PREFER session_id from `connect_host` or `list_connections`
- `show_terminal` - Focus/show terminal in UI
  - **Terminal identifier**: PREFER session_id from `connect_host` or `list_connections`
- `update_connection_notes` - Update notes/context for a connection (persisted across sessions)
- `auto_paginate` - Enable auto-pagination for the next command (automatically sends space through --More-- prompts)
  - **Terminal identifier**: PREFER session_id from `connect_host` or `list_connections`
- `set_device_type` - Override device type for an active terminal session
  - **Runtime correction**: Immediately changes device type for currently running session
  - **Also persists**: Updates connection settings if connection found
  - **Use case**: "Auto-detection got it wrong, fix it now for this active session"
  - **Terminal identifier**: PREFER session_id from `connect_host` or `list_connections`
  - **Note**: For configuration-only changes (no active session), use `edit_connection` instead

### MCP Tool Best Practices
- **Use session IDs**: Always use the session_id returned by `connect_host` when interacting with terminals
  - Session IDs are unique even when multiple sessions exist for the same device
  - Format: `{hostname}-{timestamp}-{random}` (e.g., `router1-1234567890-abc123`)
  - Using terminal names can cause ambiguity when multiple sessions exist
- **Always show before send**: Call `show_terminal` before `send_to_terminal` to display the terminal window to the user
  - Provides transparency about which terminal is being used
  - Allows users to monitor command execution in real-time
  - Improves user trust and situational awareness

## Development Guidelines

### Adding New Features
1. Follow existing patterns (see file structure above)
2. Use TypeScript strictly, no `any` types
3. Add to CLAUDE.md when complete
4. Update README.md if user-facing

### Security Considerations
- New output must go through password filter before LLM
- Logs should contain raw output (no filtering)
- Strict Mode approval required for any LLM interaction
- Never auto-execute - always require user action

### Terminal Output Handling
- Visual highlighting: applied to display only
- Output buffer: stores unhighlighted text for tools
- Logs: write raw unhighlighted output (includes all control sequences)
- LLM: send processed output that reflects actual terminal display
  - Secrets filtered via password filter patterns
  - Terminal control sequences processed (carriage returns, backspaces, line clearing)
  - Pagination prompts naturally removed by control sequence processing (same as terminal display)
  - LLM sees what the user sees after pagination completes
- Auto-pagination: Only enabled for MCP `send_to_terminal` commands (not manual user input)
  - Automatically sends space when `--More--` prompts detected
  - Commands are queued during pagination and sent after completion
  - Pattern matching preserves whitespace (no trim on buffer) to correctly match pagination patterns
  - Manual terminal commands by users do NOT trigger auto-pagination

### Configuration
- Use VSCode settings for user preferences
- Support both global and per-connection overrides
- Provide sensible defaults
- Document in README.md

---

## Recent Security & Quality Improvements (v0.2.0-preview)

The following improvements were implemented in preparation for public release:

### Critical Security Fixes (5)

1. **Rate Limiting Hardened** - Reduced from 100 to 20 requests/second to prevent DoS
2. **Encryption Key Generation Fixed** - Now derives from VSCode machine ID for persistence
3. **Telnet Command Injection Prevented** - Added hostname and port validation
4. **Device Type Validation** - Fixed mismatch between documentation and implementation
5. **MCP Parameter Validation** - Added comprehensive type checking for all tool parameters

### High Priority Improvements (3)

6. **Console Logging Replaced** - All logging now uses VSCode output channel (`src/utils/outputChannel.ts`)
7. **Stream Error Handlers Added** - Prevents crashes from stream failures
8. **Package Optimization** - Enhanced `.vscodeignore` to reduce extension size by ~30%

### Medium Priority Enhancements (9)

9. **Secret Pattern Coverage Expanded** - Added 25+ patterns:
   - Cisco: TACACS+, RADIUS, SNMP v1/v2c/v3, BGP MD5, OSPF, EIGRP, WPA PSK
   - Juniper: SNMP v3, TACACS+, RADIUS, BGP, IPsec, SSH private keys
   - FortiOS: IPsec PSK, SNMP, TACACS+, RADIUS, certificates

10. **Buffer Memory Limits** - 10MB hard limit with binary search trimming algorithm
11. **Connection Settings Validation** - Validates hostnames, ports, baud rates, paths
12. **Secure Log File Permissions** - Session logs created with 0600 (owner-only)
13. **Reduced Authentication Timeout** - 5s → 2s for faster failure detection
14. **Resource Cleanup on Deactivate** - Properly closes all PTY processes
15. **Connection Notes Size Limit** - 10KB maximum to prevent settings bloat
16. **Improved Tilde Expansion** - Better handling of `~/path` patterns
17. **Race Condition Verification** - Confirmed timers properly cleared on close

### Code Quality Improvements (4)

18. **Removed Dead Code** - Cleaned ~96 lines of commented-out highlight_output function
19. **Enhanced Package Metadata** - Added 16 keywords, categories, preview flag
20. **Centralized MCP Validation** - Reduced ~90 lines of repetitive validation to 6 lines with schemas
21. **Removed Unused Imports** - Cleaner dependency tree

### Documentation Enhancements

- Added specific security warnings to README
- Created Security Best Practices section
- Documented Known Limitations
- Added LICENSE reference to package.json

### Statistics

- **Total Issues Fixed**: 24
- **Lines of Code Removed**: ~190 (dead code + duplication)
- **Security Vulnerabilities Addressed**: 7 critical/high
- **Compilation Status**: ✅ Zero errors/warnings
- **Package Size Reduction**: ~30%

### New Features (Post v0.2.0)

22. **Sequential Connection Establishment** - Fixed authentication prompt conflicts when opening multiple sessions
    - Connections established sequentially, waiting for each to authenticate before starting the next
    - Monitors PTY output events to detect when connection is ready (1s settle time after first output)
    - 30s timeout per connection with proper error handling
    - Prevents password prompt race conditions that caused authentication failures

### Remaining for v1.0 Stable

- Add comprehensive test coverage (especially security-critical paths)
- External security audit
- Performance profiling and optimization
- Split large files (sshPseudoterminal.ts) for better maintainability

