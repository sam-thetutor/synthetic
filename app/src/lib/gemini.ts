// LLM client — uses OpenRouter (OpenAI-compatible API) with free models.

import { getEnvConfig } from "./env";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const PRIMARY_MODEL = "qwen/qwen3-coder:free";
const FALLBACK_MODEL = "stepfun/step-3.5-flash:free";
const REQUEST_TIMEOUT_MS = 15000;
const RATE_LIMIT_COOLDOWN_MS = 90000;
const MAX_RETRIES_PER_MODEL = 1;

let primaryRateLimitedUntil = 0;

// ── Types ───────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenRouterChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[];
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >;
    required?: string[];
  };
}

// ── Core API call ───────────────────────────────────────────────────

async function openRouterRequest(
  messages: ChatMessage[],
  tools?: ToolDeclaration[],
  model?: string
): Promise<OpenRouterResponse> {
  const config = getEnvConfig();
  if (!config.openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const requestedModel = model || PRIMARY_MODEL;
  const selectedModel =
    requestedModel === PRIMARY_MODEL && Date.now() < primaryRateLimitedUntil
      ? FALLBACK_MODEL
      : requestedModel;

  const body: Record<string, unknown> = {
    model: selectedModel,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(OPENROUTER_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openrouterApiKey}`,
          "HTTP-Referer": "https://synthetic-celo.app",
          "X-Title": "Synthetic Agent Company",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        return res.json();
      }

      const text = await res.text();

      // If primary is rate-limited, cool down and switch immediately.
      if (res.status === 429 && selectedModel === PRIMARY_MODEL) {
        primaryRateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        console.warn("Primary model rate-limited (429). Using fallback model for cooldown window.");
        return openRouterRequest(messages, tools, FALLBACK_MODEL);
      }

      // Retry transient server/rate-limit errors once for the same model.
      const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES_PER_MODEL;
      if (shouldRetry) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }

      // If non-primary model failed and we can still fall back, do so once.
      if (selectedModel !== FALLBACK_MODEL) {
        console.warn(`Primary model failed (${res.status}). Trying fallback model.`);
        return openRouterRequest(messages, tools, FALLBACK_MODEL);
      }

      throw new Error(`OpenRouter API error ${res.status}: ${text}`);
    } catch (error) {
      clearTimeout(timer);
      const message = (error as Error).message;
      const isAbort = message.includes("aborted") || message.includes("AbortError");
      lastError = new Error(
        isAbort
          ? `OpenRouter request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : message
      );

      if (attempt < MAX_RETRIES_PER_MODEL) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }

      if (selectedModel !== FALLBACK_MODEL) {
        console.warn("Primary model request failed. Trying fallback model.");
        return openRouterRequest(messages, tools, FALLBACK_MODEL);
      }
    }
  }

  throw lastError || new Error("OpenRouter request failed");
}

// ── Simple chat (no tools) ──────────────────────────────────────────

export async function chatWithLLM(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const data = await openRouterRequest([
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error("Empty response from LLM");
  }
  return reply;
}

// ── Tool-calling agent loop ─────────────────────────────────────────

export interface ToolCallResult {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AgentLoopResult {
  response: string;
  toolCalls: ToolCallResult[];
}

export const TOOL_LOOP_INCOMPLETE_RESPONSE =
  "I could not complete the task reliably within the tool-call limit. Review the tool results, narrow the request, or provide a specific working endpoint.";

/**
 * Run a multi-turn agent loop with tool calling.
 * The LLM can call tools, we execute them, feed results back, repeat.
 * Max iterations prevents runaway loops.
 */
export async function runAgentLoop(
  systemPrompt: string,
  userMessage: string,
  tools: ToolDeclaration[],
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>,
  maxIterations = 5
): Promise<AgentLoopResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
  const allToolCalls: ToolCallResult[] = [];

  for (let i = 0; i < maxIterations; i++) {
    const data = await openRouterRequest(messages, tools);

    const choice = data.choices?.[0];
    if (!choice) throw new Error("No response from LLM");

    const msg = choice.message;

    // Check if there are tool calls
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // No tool calls — return text response
      const response = msg.content || "Task completed.";
      return { response, toolCalls: allToolCalls };
    }

    // Add assistant message with tool calls to conversation
    messages.push({
      role: "assistant",
      content: msg.content,
      tool_calls: msg.tool_calls,
    });

    // Execute each tool call and feed results back
    for (const tc of msg.tool_calls) {
      const { name } = tc.function;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      let result: unknown;
      try {
        result = await executeTool(name, args);
      } catch (e) {
        result = { error: (e as Error).message };
      }

      allToolCalls.push({ name, args, result });

      // Add tool result message
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_call_id: tc.id,
      });
    }
  }

  // Hit max iterations — return what we have
  return {
    response: TOOL_LOOP_INCOMPLETE_RESPONSE,
    toolCalls: allToolCalls,
  };
}
