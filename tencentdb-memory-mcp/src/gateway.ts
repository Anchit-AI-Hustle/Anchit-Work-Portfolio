/**
 * Thin, typed HTTP client for the TencentDB Agent Memory gateway.
 *
 * The gateway (from TencentCloud/TencentDB-Agent-Memory) exposes a small REST
 * surface on top of its 4-tier local memory pipeline
 * (L0 conversation -> L1 atoms -> L2 scenes -> L3 persona). This module is the
 * single place that knows those routes, their payloads, and how to authenticate
 * — every MCP tool composes these helpers instead of talking HTTP directly.
 */

import axios, { AxiosError, type AxiosInstance } from "axios";
import {
  GATEWAY_API_KEY,
  GATEWAY_URL,
  REQUEST_TIMEOUT_MS,
} from "./constants.js";

// ---- Response shapes (mirrors the gateway's documented JSON) ---------------

export interface HealthResponse {
  status: "ok" | "degraded" | string;
  version: string;
  uptime: number;
  stores: {
    vectorStore: boolean;
    embeddingService: boolean;
  };
}

export interface RecallResponse {
  context: string;
  strategy: string;
  memory_count: number;
}

export interface CaptureResponse {
  l0_recorded: number;
  scheduler_notified: boolean;
}

export interface SearchMemoriesResponse {
  results: string;
  total: number;
  strategy: string;
}

export interface SearchConversationsResponse {
  results: string;
  total: number;
}

export interface SessionEndResponse {
  flushed: boolean;
}

// ---- Client ----------------------------------------------------------------

let client: AxiosInstance | null = null;

/** Lazily build (and reuse) a configured axios instance for the gateway. */
function getClient(): AxiosInstance {
  if (client) return client;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (GATEWAY_API_KEY) {
    headers.Authorization = `Bearer ${GATEWAY_API_KEY}`;
  }
  client = axios.create({
    baseURL: GATEWAY_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers,
  });
  return client;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await getClient().post<T>(path, body);
  return res.data;
}

async function get<T>(path: string): Promise<T> {
  const res = await getClient().get<T>(path);
  return res.data;
}

// ---- Endpoint wrappers -----------------------------------------------------

export const gateway = {
  health: (): Promise<HealthResponse> => get<HealthResponse>("/health"),

  recall: (query: string, sessionKey: string): Promise<RecallResponse> =>
    post<RecallResponse>("/recall", { query, session_key: sessionKey }),

  capture: (args: {
    user_content: string;
    assistant_content: string;
    session_key: string;
    session_id?: string;
  }): Promise<CaptureResponse> => post<CaptureResponse>("/capture", args),

  searchMemories: (args: {
    query: string;
    limit?: number;
    type?: string;
    scene?: string;
  }): Promise<SearchMemoriesResponse> =>
    post<SearchMemoriesResponse>("/search/memories", args),

  searchConversations: (args: {
    query: string;
    limit?: number;
    session_key?: string;
  }): Promise<SearchConversationsResponse> =>
    post<SearchConversationsResponse>("/search/conversations", args),

  sessionEnd: (sessionKey: string): Promise<SessionEndResponse> =>
    post<SessionEndResponse>("/session/end", { session_key: sessionKey }),
};

// ---- Error formatting ------------------------------------------------------

/**
 * Turn any thrown error into an actionable, model-readable message. The most
 * common failure by far is "gateway isn't running", so we call that out
 * explicitly with the fix instead of leaking a raw ECONNREFUSED.
 */
export function formatGatewayError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError;
    if (err.response) {
      const status = err.response.status;
      const detail =
        typeof err.response.data === "string"
          ? err.response.data
          : JSON.stringify(err.response.data);
      switch (status) {
        case 401:
        case 403:
          return `Error: Gateway rejected the request (HTTP ${status}). Set TDAI_GATEWAY_API_KEY to the gateway's API key and restart the MCP server.`;
        case 404:
          return `Error: Gateway route not found (HTTP 404). Your gateway build may be older than this bridge expects — update TencentDB-Agent-Memory. Detail: ${detail}`;
        case 429:
          return "Error: Gateway rate limit hit (HTTP 429). Wait a moment and retry.";
        default:
          return `Error: Gateway request failed with HTTP ${status}. Detail: ${detail}`;
      }
    }
    if (err.code === "ECONNREFUSED" || err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      return `Error: Could not reach the TencentDB memory gateway at ${GATEWAY_URL} (${err.code}). Is it running? Start it with 'bash scripts/setup-gateway.sh' (or check TDAI_GATEWAY_URL), then verify with: curl ${GATEWAY_URL}/health`;
    }
    return `Error: Network error talking to the gateway: ${err.message}`;
  }
  return `Error: Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}
