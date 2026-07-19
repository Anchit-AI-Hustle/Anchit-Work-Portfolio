# TencentDB Memory MCP — persistent memory for Claude Code

Give Claude Code **long-term, fully-local memory** by bridging it to
[TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)
— Tencent's open-source 4-tier memory pipeline
(**L0** conversation → **L1** atoms → **L2** scenes → **L3** persona), backed by
local SQLite + `sqlite-vec`.

TencentDB Agent Memory ships as a plugin for the OpenClaw / Hermes agent
frameworks — **not** as an MCP server, so Claude can't use it directly. This
project is the missing piece: a small **MCP server** that wraps the memory
**gateway** and exposes it to Claude Code as six tools.

```
┌──────────────┐   MCP (stdio)   ┌────────────────────────┐   HTTP :8420   ┌──────────────────────────┐
│  Claude Code │ ───────────────▶│  this bridge           │ ─────────────▶ │  TencentDB memory gateway │
│              │  remember /     │  (tencentdb-memory-mcp)│  /recall …     │  4-tier pipeline + SQLite │
│              │  recall tools   │                        │                │  (sqlite-vec, all local)  │
└──────────────┘                 └────────────────────────┘                └──────────────────────────┘
```

## Tools exposed to Claude

| Tool | Gateway route | What it does |
|------|---------------|--------------|
| `tencentdb_memory_recall` | `POST /recall` | Pull fused long-term context for a query (read-only) |
| `tencentdb_memory_capture` | `POST /capture` | Record a user+assistant turn for later recall |
| `tencentdb_memory_search` | `POST /search/memories` | Semantic search over distilled memories (L1) |
| `tencentdb_memory_search_conversations` | `POST /search/conversations` | Search the raw conversation log (L0) |
| `tencentdb_memory_session_end` | `POST /session/end` | Flush a session into long-term memory now |
| `tencentdb_memory_health` | `GET /health` | Check the gateway is up |

## Prerequisites

- **Node.js ≥ 18** (built and tested on Node 22)
- The **TencentDB memory gateway** running locally (the setup script installs it)
- *(Optional but recommended)* an LLM API key for the gateway's distillation
  step (persona/scene building). Raw capture + recall work without it.

## Setup — three steps

### 1. Build the bridge

```bash
cd tencentdb-memory-mcp
npm install
npm run build          # produces dist/index.js
```

### 2. Start the memory gateway

```bash
cp .env.example .env   # then edit: set TDAI_LLM_* if you want distillation
bash scripts/setup-gateway.sh --bg     # installs the gateway (first run) + starts it
curl http://127.0.0.1:8420/health      # should return {"status":"ok",...}
```

`--bg` runs it in the background and logs to `~/.memory-tencentdb/gateway.log`.
Omit it to run in the foreground. Re-run any time to start it again; the install
step is skipped once it's present.

### 3. Register the bridge with Claude Code

**Option A — CLI (recommended):**

```bash
claude mcp add tencentdb-memory \
  --env TDAI_GATEWAY_URL=http://127.0.0.1:8420 \
  --env TDAI_SESSION_KEY=claude-code \
  -- node /absolute/path/to/tencentdb-memory-mcp/dist/index.js
```

**Option B — config file:** merge [`claude-code.mcp.json`](./claude-code.mcp.json)
into your project `.mcp.json` (or `~/.claude.json`), replacing `ABSOLUTE_PATH`
with the real path.

Restart Claude Code, then run `/mcp` — you should see `tencentdb-memory`
connected with its six tools. Ask Claude to *"recall what you remember about
me"* or *"remember that I prefer draft PRs"* to exercise it.

## Configuration

All configuration is via environment variables (the bridge reads them at start;
the gateway reads its own from `.env` / your shell).

| Variable | Used by | Default | Purpose |
|----------|---------|---------|---------|
| `TDAI_GATEWAY_URL` | bridge | `http://127.0.0.1:8420` | Where the gateway listens |
| `TDAI_GATEWAY_API_KEY` | bridge | *(none)* | Bearer token, if the gateway is protected |
| `TDAI_SESSION_KEY` | bridge | `claude-code` | Identity all memory is namespaced under |
| `TDAI_GATEWAY_TIMEOUT_MS` | bridge | `30000` | Per-request timeout |
| `MEMORY_TENCENTDB_GATEWAY_HOST` / `_PORT` | gateway | `127.0.0.1` / `8420` | Gateway bind address |
| `TDAI_LLM_API_KEY` / `_BASE_URL` / `_MODEL` | gateway | *(none)* | LLM for L1/L2/L3 distillation |

## How Claude should use it

The tools are self-describing, but the intended loop is:

1. **Start of a task** → `tencentdb_memory_recall` to load what's known.
2. **After a meaningful exchange** → `tencentdb_memory_capture` to record it.
3. **Wrapping up** → `tencentdb_memory_session_end` to flush it into long-term
   memory so it's recallable next session.

You can nudge this with a line in your `CLAUDE.md`, e.g. *"At the start of a
task, call `tencentdb_memory_recall`; after learning a durable fact about me,
call `tencentdb_memory_capture`."*

## Troubleshooting

- **`ECONNREFUSED` from a tool** → the gateway isn't running. Start it
  (`bash scripts/setup-gateway.sh --bg`) and check `curl .../health`.
- **HTTP 401/403** → the gateway wants auth. Set `TDAI_GATEWAY_API_KEY` to match
  the gateway's key and restart Claude Code.
- **Recall returns nothing** → expected on a cold start; capture some turns and
  end the session first. Confirm the gateway is healthy with
  `tencentdb_memory_health`.
- **HTTP 404 on a route** → your gateway build predates these routes; update the
  `@tencentdb-agent-memory/memory-tencentdb` package.

## Layout

```
tencentdb-memory-mcp/
├── src/
│   ├── index.ts        # MCP server + the six tool definitions
│   ├── gateway.ts      # typed HTTP client for the gateway + error formatting
│   └── constants.ts    # env-driven configuration
├── scripts/
│   └── setup-gateway.sh# installs + launches the TencentDB memory gateway
├── claude-code.mcp.json# registration snippet for Claude Code
├── .env.example        # copy to .env
├── package.json
└── tsconfig.json
```

## Notes & attribution

- The memory engine, pipeline, and gateway are **TencentDB Agent Memory**
  (MIT, © TencentCloud). This folder is an independent MCP adapter for it and
  claims no affiliation.
- Everything stays local by default — the gateway stores data under
  `~/.openclaw/memory-tdai/` with no external database required.
