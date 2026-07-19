/**
 * Shared configuration + constants for the TencentDB Memory MCP bridge.
 *
 * Every value is read from the environment so the same build works whether the
 * gateway runs locally (default) or on another host. See README.md for the full
 * list of variables and how to wire them into Claude Code.
 */

/** Base URL of the running TencentDB Agent Memory gateway (its `/health`, `/recall`, ... routes). */
export const GATEWAY_URL: string = (
  process.env.TDAI_GATEWAY_URL ||
  process.env.MEMORY_TENCENTDB_GATEWAY_URL ||
  "http://127.0.0.1:8420"
).replace(/\/+$/, "");

/**
 * Optional bearer token the gateway expects on protected routes. The gateway
 * accepts it under either name, so we honor both here.
 */
export const GATEWAY_API_KEY: string | undefined =
  process.env.TDAI_GATEWAY_API_KEY ||
  process.env.MEMORY_TENCENTDB_GATEWAY_API_KEY ||
  undefined;

/**
 * Default "who am I talking to" key. The gateway namespaces every memory tier
 * by this value, so a stable default lets Claude Code build one continuous
 * memory across sessions without having to pass it on every call.
 */
export const DEFAULT_SESSION_KEY: string =
  process.env.TDAI_SESSION_KEY || "claude-code";

/** How long (ms) to wait on any single gateway request before giving up. */
export const REQUEST_TIMEOUT_MS: number = Number(
  process.env.TDAI_GATEWAY_TIMEOUT_MS || 30_000
);

/** Max characters returned to the model before we truncate, to protect context. */
export const CHARACTER_LIMIT = 25_000;

export const SERVER_NAME = "tencentdb-memory-mcp-server";
export const SERVER_VERSION = "1.0.0";
