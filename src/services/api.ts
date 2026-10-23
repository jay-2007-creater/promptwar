import type { AgentEvent, AgentHealth, AgentRequest, AgentResponse } from "@/types";

/**
 * API service layer.
 *
 * SECURITY: The browser holds NO credentials. The only client-side variable is a non-secret
 * endpoint base URL. The Gemini API key lives exclusively in the backend environment, which is
 * why this layer can be pointed at a secure backend (Antigravity / Cloud Run) without any
 * frontend change. When no endpoint is configured the app runs a deterministic local pipeline
 * and says so in the UI — it never pretends a model connection exists.
 */

const RAW_ENDPOINT = (import.meta.env.VITE_AGENT_API_URL ?? "").trim();

export const REQUEST_TIMEOUT_MS = 20_000;
export const HEALTH_TIMEOUT_MS = 4_000;

export function getAgentEndpoint(): string | null {
  return RAW_ENDPOINT ? RAW_ENDPOINT.replace(/\/$/, "") : null;
}

export function isBackendConfigured(): boolean {
  return getAgentEndpoint() !== null;
}

export class AgentRequestError extends Error {
  kind: "network" | "timeout" | "http" | "invalid_response";
  status?: number;

  constructor(kind: AgentRequestError["kind"], message: string, status?: number) {
    super(message);
    this.name = "AgentRequestError";
    this.kind = kind;
    this.status = status;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AgentRequestError(
        "timeout",
        `The agent backend did not respond within ${Math.round(timeoutMs / 1000)} s.`,
      );
    }
    throw new AgentRequestError(
      "network",
      "Could not reach the agent backend. Check the endpoint and your connection.",
    );
  } finally {
    window.clearTimeout(timer);
  }
}

/** Probes the configured backend. Never reports "connected" without a successful response. */
export async function checkAgentHealth(): Promise<AgentHealth> {
  const endpoint = getAgentEndpoint();
  if (!endpoint) {
    return {
      connected: false,
      mode: "fallback",
      endpoint: null,
      detail:
        "No backend endpoint configured (VITE_AGENT_API_URL). Running deterministic local analysis tools — no model is connected.",
    };
  }

  try {
    const response = await fetchWithTimeout(
      `${endpoint}/health`,
      { method: "GET", headers: { accept: "application/json" } },
      HEALTH_TIMEOUT_MS,
    );
    if (!response.ok) {
      return {
        connected: false,
        mode: "fallback",
        endpoint,
        detail: `Backend responded with HTTP ${response.status}. Falling back to deterministic local tools.`,
      };
    }
    const body = (await response.json()) as {
      model?: string;
      geminiConfigured?: boolean;
    };
    if (!body?.geminiConfigured) {
      return {
        connected: false,
        mode: "fallback",
        endpoint,
        detail:
          "Backend is reachable but reports no Gemini credentials configured. Falling back to deterministic local tools.",
      };
    }
    return {
      connected: true,
      mode: "backend",
      endpoint,
      detail: `Connected to agent backend${body.model ? ` · model ${body.model}` : ""}.`,
    };
  } catch (error) {
    return {
      connected: false,
      mode: "fallback",
      endpoint,
      detail:
        error instanceof AgentRequestError
          ? error.message
          : "Backend health probe failed. Falling back to deterministic local tools.",
    };
  }
}

/**
 * Delegates a turn to the secure backend. Structured events are streamed back through
 * `onEvent` only when the backend actually emits them.
 */
export async function callBackendAgent(
  request: AgentRequest,
  onEvent: (event: AgentEvent) => void,
): Promise<AgentResponse> {
  const endpoint = getAgentEndpoint();
  if (!endpoint) {
    throw new AgentRequestError("network", "No agent backend endpoint is configured.");
  }

  const response = await fetchWithTimeout(
    `${endpoint}/agent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new AgentRequestError(
      "http",
      `Agent backend returned HTTP ${response.status}.`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AgentRequestError(
      "invalid_response",
      "The agent backend returned a response that is not valid JSON.",
    );
  }

  const body = payload as Partial<AgentResponse> & { events?: AgentEvent[] };
  if (!body || typeof body.summary !== "string" || !Array.isArray(body.actions)) {
    throw new AgentRequestError(
      "invalid_response",
      "The agent backend response did not match the expected contract.",
    );
  }

  (body.events ?? []).forEach(onEvent);
  return body as AgentResponse;
}
