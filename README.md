# mcp-local-sandbox-cleaner

An MCP server that finds the junk coding agents leave behind in a workspace:
scratch directories, test caches, and dev ports that may no longer be serving
anything. It can delete the files; it only reports the ports.

Not published to npm — build it from source.

## Install

```sh
pnpm install
pnpm build
```

Point your MCP client at `dist/index.js`:

```json
{
  "mcpServers": {
    "sandbox-cleaner": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-local-sandbox-cleaner/dist/index.js"]
    }
  }
}
```

## Tools

### `scan_sandbox_artifacts`

Lists matching paths and how long ago each was modified.

| Argument | Type | Meaning |
| --- | --- | --- |
| `workspacePath` | string | Workspace root. |
| `minAgeMinutes` | number | Skip anything modified more recently than this. Defaults to 0. |

Looks for these names directly under the workspace root, no recursion:
`.scratch`, `.agent-tmp`, `tmp_test_output`, `.pytest_cache`, `.coverage`,
`coverage`, `.turbo`, `.tsbuildinfo`.

`.tsbuildinfo` is matched as that exact filename, so it will not catch the
`tsconfig.tsbuildinfo` files the TypeScript compiler actually writes. The list
is a plain array at the top of `src/index.ts`; edit it to suit your workspace.

### `clean_sandbox_artifacts`

Deletes what `scan_sandbox_artifacts` would list.

| Argument | Type | Meaning |
| --- | --- | --- |
| `workspacePath` | string | Workspace root. |
| `dryRun` | boolean | Report without deleting. Defaults to false. |
| `minAgeMinutes` | number | Skip recently modified paths. Defaults to 0. |

Two things to know before running this without `dryRun`:

- **It does not consult git.** A tracked file inside `.scratch/` is deleted like
  anything else. Run with `dryRun: true` first if that matters.
- `coverage` is matched by name at the workspace root. If you keep real source
  in a directory called `coverage`, it goes.

`minAgeMinutes` is the guard against deleting a directory an agent is still
writing to. Set it to something like 15 to leave in-flight work alone.

### `inspect_dangling_dev_ports`

Reports which of the given ports are in use. Defaults to
`3000, 3001, 5173, 5174, 8000, 8080, 8888`.

It does not identify the owning process and does not kill anything. Despite the
name, the check is just "is this port occupied" — a healthy dev server and a
zombie one look the same.

On Windows the match goes through `findstr`, which is a substring test: probing
`3000` also reports listeners on `13000` and `30000`. On Linux it uses
`lsof -i`, which matches the port exactly.

## License

MIT. See [LICENSE](LICENSE).
