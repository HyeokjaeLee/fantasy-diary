MCP Server for Escape From Seoul

Overview
- Implements a Model Context Protocol (MCP) server over stdio.
- Tools expose CRUD for entries, characters, and places via the generated Supabase REST SDK in `@supabase-api/*`.
- File: `mcp/server.ts`.

Prerequisites
- Node 18+
- Env vars set in your shell:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_SUPABASE_SERVICE_ROLE`

Install dependencies
```
npm i -D @modelcontextprotocol/sdk json-schema
```

Build and run
```
tsc -p .
node dist/mcp/server.js
```

Configure MCP client
- Point your MCP-compatible client to launch the server command above (stdio transport).
- Example (psuedoconfig):
```
{
  "servers": {
    "escape-from-seoul": {
      "command": "node",
      "args": ["dist/mcp/server.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "NEXT_SUPABASE_SERVICE_ROLE": "YOUR_SERVICE_ROLE_KEY"
      }
    }
  }
}
```

Notes
- All requests use `@supabase-api/sdk.gen` and `@supabase-api/client.gen` (no ad-hoc fetch).
