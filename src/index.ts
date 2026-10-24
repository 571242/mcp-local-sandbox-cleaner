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
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Standard transient artifact markers commonly generated during AI coding turns
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
          "Scan a workspace root for leftover scratch directories and test caches, with an optional age threshold. Top level only, no recursion.",
        inputSchema: {
          type: "object",
          properties: {
            workspacePath: {
              type: "string",
              description: "Absolute or relative path to the workspace root.",
            },
            minAgeMinutes: {
              type: "number",
              description:
                "Optional minimum age in minutes since last modification (default: 0). Set e.g. 15 to avoid touching files currently in use by an ongoing turn.",
            },
          },
          required: ["workspacePath"],
        },
      },
      {
        name: "clean_sandbox_artifacts",
        description:
          "Delete the scratch directories and caches that scan_sandbox_artifacts reports. Does not consult git; use dryRun to preview.",
        inputSchema: {
          type: "object",
          properties: {
            workspacePath: {
              type: "string",
              description: "Target workspace path.",
            },
            dryRun: {
              type: "boolean",
              description:
                "If true, only report what would be deleted without actually deleting.",
            },
            minAgeMinutes: {
              type: "number",
              description:
                "Minimum age in minutes. Files modified more recently will be skipped to avoid disrupting active agent sessions.",
            },
          },
          required: ["workspacePath"],
        },
      },
      {
        name: "inspect_dangling_dev_ports",
        description:
          "Report which of the given ports are currently in use. Does not identify the owning process or kill anything.",
        inputSchema: {
          type: "object",
          properties: {
            ports: {
              type: "array",
              items: { type: "number" },
              description:
                "Optional list of port numbers to check. Defaults to standard dev ports [3000, 3001, 5173, 5174, 8000, 8080, 8888].",
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
      const minAge = Number(args?.minAgeMinutes || 0);
      const now = Date.now();
      const found: { name: string; fullPath: string; isDir: boolean; ageMinutes: number }[] = [];

      for (const target of DEFAULT_CLEANUP_TARGETS) {
        const full = path.resolve(workspace, target);
        try {
          const stat = await fs.stat(full);
          const ageMinutes = Math.floor((now - stat.mtimeMs) / (1000 * 60));
          if (ageMinutes >= minAge) {
            found.push({
              name: target,
              fullPath: full,
              isDir: stat.isDirectory(),
              ageMinutes,
            });
          }
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
                minAgeFilterMinutes: minAge,
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
      const minAge = Number(args?.minAgeMinutes || 0);
      const now = Date.now();
      const cleaned: { path: string; ageMinutes: number }[] = [];
      const skippedActive: { path: string; ageMinutes: number }[] = [];

      for (const target of DEFAULT_CLEANUP_TARGETS) {
        const full = path.resolve(workspace, target);
        try {
          const stat = await fs.stat(full);
          const ageMinutes = Math.floor((now - stat.mtimeMs) / (1000 * 60));

          if (ageMinutes < minAge) {
            skippedActive.push({ path: full, ageMinutes });
            continue;
          }

          if (!dryRun) {
            await fs.rm(full, { recursive: true, force: true });
          }
          cleaned.push({ path: full, ageMinutes });
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
                mode: dryRun ? "dry-run (preview only)" : "executed",
                deletedCount: cleaned.length,
                deleted: cleaned,
                skippedActiveSessions: skippedActive,
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
            // netstat prints one row per socket; match the local address column
            // exactly so probing 3000 does not also hit 13000 or 30000.
            const { stdout } = await execAsync("netstat -ano");
            const listening = stdout.split(/\r?\n/).some((line) => {
              const cols = line.trim().split(/\s+/);
              const local = cols[1] || "";
              return local.endsWith(`:${p}`);
            });
            if (listening) {
              occupied.push({ port: p, status: "OCCUPIED" });
            }
          } else {
            const { stdout } = await execAsync(`lsof -i :${p}`);
            if (stdout && stdout.trim().length > 0) {
              occupied.push({ port: p, status: "OCCUPIED" });
            }
          }
        } catch {
          // free
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
  console.error("mcp-local-sandbox-cleaner v0.2.0 active");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
