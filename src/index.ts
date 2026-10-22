#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const server = new Server(
  {
    name: "mcp-local-sandbox-cleaner",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Common temporary artifact patterns left by AI agents & test runners
const DEFAULT_CLEANUP_TARGETS = [
  ".scratch",
  ".agent-tmp",
  "tmp_test_output",
  ".pytest_cache",
  ".coverage",
  "coverage",
  ".turbo",
  ".tsbuildinfo",
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "scan_sandbox_artifacts",
        description:
          "Scan a target workspace for dangling temporary test outputs, agent scratches, and bloated caches.",
        inputSchema: {
          type: "object",
          properties: {
            workspacePath: {
              type: "string",
              description: "Absolute or relative path to the workspace root.",
            },
          },
          required: ["workspacePath"],
        },
      },
      {
        name: "clean_sandbox_artifacts",
        description:
          "Safely delete verified transient files and directories (like .scratch, .pytest_cache) to recover disk space.",
        inputSchema: {
          type: "object",
          properties: {
            workspacePath: {
              type: "string",
              description: "Target workspace path.",
            },
            dryRun: {
              type: "boolean",
              description: "If true, only report what would be deleted without taking action.",
            },
          },
          required: ["workspacePath"],
        },
      },
      {
        name: "inspect_dangling_dev_ports",
        description:
          "Detect orphaned local development ports (e.g. 3000, 5173, 8000, 8080) left behind by stopped agent runs.",
        inputSchema: {
          type: "object",
          properties: {
            ports: {
              type: "array",
              items: { type: "number" },
              description: "Optional list of port numbers to check. Defaults to common dev ports.",
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "scan_sandbox_artifacts") {
      const workspace = String(args?.workspacePath || ".");
      const found: { name: string; fullPath: string; isDir: boolean }[] = [];

      for (const target of DEFAULT_CLEANUP_TARGETS) {
        const full = path.resolve(workspace, target);
        try {
          const stat = await fs.stat(full);
          found.push({ name: target, fullPath: full, isDir: stat.isDirectory() });
        } catch {
          // not found, ignore
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                workspace: path.resolve(workspace),
                totalFound: found.length,
                artifacts: found,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "clean_sandbox_artifacts") {
      const workspace = String(args?.workspacePath || ".");
      const dryRun = Boolean(args?.dryRun ?? false);
      const cleaned: string[] = [];

      for (const target of DEFAULT_CLEANUP_TARGETS) {
        const full = path.resolve(workspace, target);
        try {
          await fs.stat(full);
          if (!dryRun) {
            await fs.rm(full, { recursive: true, force: true });
          }
          cleaned.push(full);
        } catch {
          // ignore missing
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                mode: dryRun ? "dry-run (no files deleted)" : "live-cleaned",
                deletedCount: cleaned.length,
                items: cleaned,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "inspect_dangling_dev_ports") {
      const portsToCheck: number[] = Array.isArray(args?.ports) && args.ports.length > 0
        ? (args.ports as number[])
        : [3000, 3001, 5173, 5174, 8000, 8080, 8888];

      const occupied: { port: number; status: string }[] = [];

      for (const p of portsToCheck) {
        try {
          if (process.platform === "win32") {
            const { stdout } = await execAsync(`netstat -ano | findstr :${p}`);
            if (stdout && stdout.trim().length > 0) {
              occupied.push({ port: p, status: "LISTENING / OCCUPIED" });
            }
          } else {
            const { stdout } = await execAsync(`lsof -i :${p}`);
            if (stdout && stdout.trim().length > 0) {
              occupied.push({ port: p, status: "LISTENING / OCCUPIED" });
            }
          }
        } catch {
          // port free
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ activePorts: occupied }, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-local-sandbox-cleaner running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
