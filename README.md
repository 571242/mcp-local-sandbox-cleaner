# 🧹 mcp-local-sandbox-cleaner

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP Standard](https://img.shields.io/badge/MCP-Standard%20v1.0-brightgreen.svg)](https://modelcontextprotocol.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/571242/mcp-local-sandbox-cleaner/pulls)

> **Keep your local dev environment spotless while coding with AI Agents.**  
> An automated Model Context Protocol (MCP) server that audits, safely removes transient test scratchpads, and detects dangling dev ports left behind by AI Agents (Claude Code, Cursor, Codex).

---

## ⚡ Why Do You Need This?

When using autonomous coding agents or terminal AI harnesses, your workspace quickly becomes cluttered with:
- 🗑️ Forgotten `.scratch/`, `.agent-tmp/`, and ad-hoc probe scripts.
- 📁 Bloated test caches (`.pytest_cache/`, `coverage/`, `.turbo/`).
- 🔌 Zombie test servers hogging your development ports (`3000`, `5173`, `8000`).

`mcp-local-sandbox-cleaner` gives your AI assistant the self-cleaning reflex: scan and sweep temporary clutter before concluding every session.

---

## 🛠️ Features

- **🔍 Smart Artifact Auditing**: Detects well-known transient directories without touching production code or git-tracked source.
- **🛡️ Dry-Run First**: Supports previewing deletions before executing to guarantee zero accidental loss.
- **🔌 Zombie Port Detective**: Instantly catches background Vite/Next.js/FastAPI processes that failed to exit gracefully.
- **📦 Zero-Config Stdio**: Plug-and-play with any MCP-compliant client.

---

## 🚀 Quick Start & Integration

### 1. Claude Desktop Configuration

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sandbox-cleaner": {
      "command": "npx",
      "args": ["-y", "mcp-local-sandbox-cleaner"]
    }
  }
}
```

### 2. Cursor / Codex IDE Integration

Enable MCP in your settings and register the command:
```bash
npx -y mcp-local-sandbox-cleaner
```

---

## 📖 Available Tools

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `scan_sandbox_artifacts` | `workspacePath: string` | Scans and lists all temporary directories and clutter in the workspace. |
| `clean_sandbox_artifacts` | `workspacePath: string, dryRun?: boolean` | Sweeps away transient artifacts. Set `dryRun: true` to preview. |
| `inspect_dangling_dev_ports` | `ports?: number[]` | Checks if common development ports (3000, 5173, etc.) are dangling. |

---

## 🤝 Contributing & License

Contributions, feature requests, and bug reports are warmly welcome!  
Distributed under the [MIT License](LICENSE).
