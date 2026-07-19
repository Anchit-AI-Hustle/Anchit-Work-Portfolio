#!/usr/bin/env node
/**
 * TencentDB Memory MCP Server
 * ---------------------------
 * A local (stdio) MCP bridge that gives Claude Code persistent, long-term
 * memory by wrapping the TencentDB Agent Memory gateway
 * (https://github.com/TencentCloud/TencentDB-Agent-Memory).
 *
 * The gateway does the hard part — a fully-local 4-tier memory pipeline
 * (L0 conversation -> L1 atoms -> L2 scenes -> L3 persona) backed by
 * SQLite + sqlite-vec. This server simply exposes that capability to Claude
 * as a handful of well-described tools:
 *
 *   - tencentdb_memory_recall     : pull the persona/context relevant to a query
 *   - tencentdb_memory_capture    : record a turn so it can be remembered later
 *   - tencentdb_memory_search     : semantic search over distilled memories (L1)
 *   - tencentdb_memory_search_conversations : search raw conversation log (L0)
 *   - tencentdb_memory_session_end: flush a session into long-term memory
 *   - tencentdb_memory_health     : check the gateway is up
 *
 * Transport is stdio because this is a per-user local integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  CHARACTER_LIMIT,
  DEFAULT_SESSION_KEY,
  GATEWAY_URL,
  SERVER_NAME,
  SERVER_VERSION,
} from "./constants.js";
import { formatGatewayError, gateway } from "./gateway.js";

// ---- Shared helpers --------------------------------------------------------

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Build a success result carrying both a human string and structured data. */
function ok(text: string, structured: Record<string, unknown>): ToolResult {
  let out = text;
  if (out.length > CHARACTER_LIMIT) {
    out =
      out.slice(0, CHARACTER_LIMIT) +
      `\n\n…[truncated ${out.length - CHARACTER_LIMIT} chars — narrow your query or lower 'limit']`;
  }
  return {
    content: [{ type: "text", text: out }],
    structuredContent: structured,
  };
}

/** Build an error result (isError so the client renders it as a failure). */
function fail(error: unknown): ToolResult {
  return {
    content: [{ type: "text", text: formatGatewayError(error) }],
    isError: true,
  };
}

const sessionKeyField = z
  .string()
  .min(1)
  .optional()
  .describe(
    `Identity/namespace this memory belongs to. Memories are grouped per key. Omit to use the configured default ('${DEFAULT_SESSION_KEY}').`
  );

// ---- Server ----------------------------------------------------------------

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

// 1) RECALL --- pull relevant long-term context before answering.
server.registerTool(
  "tencentdb_memory_recall",
  {
    title: "Recall Long-Term Memory",
    description: `Retrieve the long-term memory context relevant to a query before you answer.

This asks the TencentDB memory gateway to run hybrid recall (BM25 + embeddings + RRF fusion) across all remembered tiers and return a compact context block — typically distilled persona facts and prior scenes about the user. Call this at the START of a task when prior context about the user or project would help. It is READ-ONLY and stores nothing.

Args:
  - query (string): What you want context about (e.g. "user's preferred deploy workflow").
  - session_key (string, optional): Identity to recall for. Defaults to the configured session key.

Returns JSON:
  {
    "context": string,        // Ready-to-use memory context (may be empty on a cold start)
    "strategy": string,       // Recall strategy the gateway used
    "memory_count": number    // How many memory items contributed
  }

Use when: starting a conversation/task and wanting to personalize or avoid re-asking known facts.
Don't use when: you just want to store something (use tencentdb_memory_capture).`,
    inputSchema: { query: z.string().min(1).describe("What to recall context about"), session_key: sessionKeyField },
    outputSchema: {
      context: z.string(),
      strategy: z.string(),
      memory_count: z.number(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ query, session_key }) => {
    try {
      const r = await gateway.recall(query, session_key || DEFAULT_SESSION_KEY);
      const text = r.context?.trim()
        ? `Recalled ${r.memory_count} memory item(s) via ${r.strategy}:\n\n${r.context}`
        : `No stored memory yet for this query (${r.memory_count} items). This is expected on a cold start.`;
      return ok(text, { context: r.context ?? "", strategy: r.strategy, memory_count: r.memory_count });
    } catch (e) {
      return fail(e);
    }
  }
);

// 2) CAPTURE --- record a conversational turn for future recall.
server.registerTool(
  "tencentdb_memory_capture",
  {
    title: "Capture Turn Into Memory",
    description: `Record one conversational turn (a user message + your reply) so it can be remembered long-term.

The gateway writes the turn to L0 immediately and schedules background distillation into atoms/scenes/persona. Call this after an exchange that contains something worth remembering — a stated preference, a decision, a fact about the user or project. It WRITES to the memory store.

Args:
  - user_content (string): What the user said.
  - assistant_content (string): What you replied.
  - session_key (string, optional): Identity to attribute this to. Defaults to the configured session key.
  - session_id (string, optional): Sub-thread id if you want to separate conversations under one identity.

Returns JSON:
  {
    "l0_recorded": number,        // Raw turns recorded (usually 1)
    "scheduler_notified": boolean // Whether background distillation was queued
  }

Use when: an exchange holds durable info worth recalling in future sessions.
Don't use when: the turn is trivial/ephemeral, or you only need to read memory.`,
    inputSchema: {
      user_content: z.string().min(1).describe("The user's message"),
      assistant_content: z.string().min(1).describe("Your reply"),
      session_key: sessionKeyField,
      session_id: z.string().min(1).optional().describe("Optional sub-thread id under the session key"),
    },
    outputSchema: { l0_recorded: z.number(), scheduler_notified: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ user_content, assistant_content, session_key, session_id }) => {
    try {
      const r = await gateway.capture({
        user_content,
        assistant_content,
        session_key: session_key || DEFAULT_SESSION_KEY,
        ...(session_id ? { session_id } : {}),
      });
      return ok(
        `Captured turn. l0_recorded=${r.l0_recorded}, distillation ${r.scheduler_notified ? "queued" : "not queued"}.`,
        { l0_recorded: r.l0_recorded, scheduler_notified: r.scheduler_notified }
      );
    } catch (e) {
      return fail(e);
    }
  }
);

// 3) SEARCH MEMORIES --- semantic search over distilled memory (L1).
server.registerTool(
  "tencentdb_memory_search",
  {
    title: "Search Distilled Memories",
    description: `Semantic search over distilled long-term memories (the L1 atom layer).

Unlike recall (which returns one fused context block), this returns discrete memory hits so you can inspect exactly what is remembered. READ-ONLY.

Args:
  - query (string): Search terms.
  - limit (number, optional, 1-100, default 10): Max hits.
  - type (string, optional): Filter by memory type if your gateway defines types.
  - scene (string, optional): Filter to a specific scene/scenario tag.

Returns JSON:
  {
    "results": string,   // Formatted matching memories
    "total": number,     // Total matches found
    "strategy": string   // Search strategy used
  }

Use when: you want to check or list what is remembered about a topic.
Don't use when: you want the single best context block to answer with (use tencentdb_memory_recall).`,
    inputSchema: {
      query: z.string().min(1).describe("Search terms"),
      limit: z.number().int().min(1).max(100).default(10).describe("Max hits (1-100)"),
      type: z.string().min(1).optional().describe("Optional memory-type filter"),
      scene: z.string().min(1).optional().describe("Optional scene/scenario filter"),
    },
    outputSchema: { results: z.string(), total: z.number(), strategy: z.string() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ query, limit, type, scene }) => {
    try {
      const r = await gateway.searchMemories({ query, limit, ...(type ? { type } : {}), ...(scene ? { scene } : {}) });
      const text = r.total > 0 ? `Found ${r.total} memory match(es) via ${r.strategy}:\n\n${r.results}` : `No memories matched "${query}".`;
      return ok(text, { results: r.results ?? "", total: r.total, strategy: r.strategy });
    } catch (e) {
      return fail(e);
    }
  }
);

// 4) SEARCH CONVERSATIONS --- search the raw L0 conversation log.
server.registerTool(
  "tencentdb_memory_search_conversations",
  {
    title: "Search Raw Conversation Log",
    description: `Search the raw conversation history (the L0 layer) rather than distilled memories.

Use this when you need the verbatim exchange — exact wording of something the user said — instead of a distilled summary. READ-ONLY.

Args:
  - query (string): Search terms.
  - limit (number, optional, 1-100, default 10): Max hits.
  - session_key (string, optional): Restrict to one identity. Defaults to the configured session key.

Returns JSON:
  {
    "results": string,   // Formatted matching raw turns
    "total": number      // Total matches found
  }

Use when: you need the exact original wording of a past exchange.
Don't use when: a distilled fact is enough (use tencentdb_memory_search / _recall).`,
    inputSchema: {
      query: z.string().min(1).describe("Search terms"),
      limit: z.number().int().min(1).max(100).default(10).describe("Max hits (1-100)"),
      session_key: sessionKeyField,
    },
    outputSchema: { results: z.string(), total: z.number() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ query, limit, session_key }) => {
    try {
      const r = await gateway.searchConversations({ query, limit, session_key: session_key || DEFAULT_SESSION_KEY });
      const text = r.total > 0 ? `Found ${r.total} conversation match(es):\n\n${r.results}` : `No conversations matched "${query}".`;
      return ok(text, { results: r.results ?? "", total: r.total });
    } catch (e) {
      return fail(e);
    }
  }
);

// 5) SESSION END --- flush a session so its turns are distilled now.
server.registerTool(
  "tencentdb_memory_session_end",
  {
    title: "End Session & Flush Memory",
    description: `Signal that a session is finished and flush its buffered turns into long-term memory now.

By default the gateway distills periodically in the background; calling this forces the pending turns for a session to be processed so they are recallable immediately. WRITES to the memory store.

Args:
  - session_key (string, optional): Identity/session to flush. Defaults to the configured session key.

Returns JSON:
  { "flushed": boolean }   // Whether a flush was performed

Use when: wrapping up a task and you want what just happened to be remembered right away.
Don't use when: mid-conversation — capturing turns is enough until you are done.`,
    inputSchema: { session_key: sessionKeyField },
    outputSchema: { flushed: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ session_key }) => {
    try {
      const r = await gateway.sessionEnd(session_key || DEFAULT_SESSION_KEY);
      return ok(r.flushed ? "Session flushed into long-term memory." : "Nothing pending to flush.", { flushed: r.flushed });
    } catch (e) {
      return fail(e);
    }
  }
);

// 6) HEALTH --- is the gateway up and are its stores ready?
server.registerTool(
  "tencentdb_memory_health",
  {
    title: "Check Memory Gateway Health",
    description: `Check that the TencentDB memory gateway is running and its stores are ready.

Call this first if any other memory tool fails, to distinguish "gateway down" from "nothing remembered". READ-ONLY.

Args: none.

Returns JSON:
  {
    "status": string,     // "ok" | "degraded" | ...
    "version": string,    // Gateway version
    "uptime": number,     // Seconds up
    "stores": { "vectorStore": boolean, "embeddingService": boolean }
  }

Use when: diagnosing memory-tool errors or confirming setup.`,
    inputSchema: {},
    outputSchema: {
      status: z.string(),
      version: z.string(),
      uptime: z.number(),
      stores: z.object({ vectorStore: z.boolean(), embeddingService: z.boolean() }),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async () => {
    try {
      const r = await gateway.health();
      const text = `Gateway ${r.status} (v${r.version}, up ${Math.round(r.uptime)}s). vectorStore=${r.stores?.vectorStore}, embeddingService=${r.stores?.embeddingService}.`;
      return ok(text, { status: r.status, version: r.version, uptime: r.uptime, stores: r.stores });
    } catch (e) {
      return fail(e);
    }
  }
);

// ---- Boot ------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol; logs must go to stderr.
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running (stdio). Gateway: ${GATEWAY_URL}`);
}

main().catch((error) => {
  console.error("Fatal: failed to start TencentDB Memory MCP server:", error);
  process.exit(1);
});
