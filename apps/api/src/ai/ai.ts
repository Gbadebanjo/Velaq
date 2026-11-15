/**
 * The AI gateway (FND-014, first slice). Every AI feature asks for AI through this one place, so
 * the provider, model, limits and logging live together. Today it talks to Claude through the
 * Anthropic Messages API, asking for an answer that matches a JSON schema (structured outputs).
 *
 * Configuration (environment):
 *   ANTHROPIC_API_KEY  required to switch AI on; without it AI features say they're unavailable
 *   AI_MODEL           defaults to claude-haiku-5-5 (fast, low cost); e.g. claude-sonnet-5-5 for richer writing
 *   AI_DAILY_LIMIT     AI requests one person may make per day (default 20)
 *   ANTHROPIC_BASE_URL optional; another address for the same API (a proxy, or a stand-in for tests)
 *
 * Nothing sent to or received from the AI is logged.
 */

export const AI_CLIENT = Symbol("AI_CLIENT");

export interface AiRequest {
  /** Instructions for the model. */
  system: string;
  /** The material to work on. */
  user: string;
  /** JSON schema the answer must match. */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface AiClient {
  readonly model: string;
  /** Returns the model's answer, parsed from JSON. */
  json<T>(req: AiRequest): Promise<T>;
}

export class AiUnavailable extends Error {
  constructor(message = "AI isn't set up yet.") {
    super(message);
  }
}

export class AiFailed extends Error {}

export const aiDailyLimit = (env = process.env) => Math.max(1, Number(env.AI_DAILY_LIMIT) || 20);

/** The configured AI client, or null when no key is set (AI features then report "not set up"). */
export function aiFromEnv(env = process.env): AiClient | null {
  const key = env.ANTHROPIC_API_KEY?.trim();
  const base = env.ANTHROPIC_BASE_URL?.trim().replace(/\/$/, "") || "https://api.anthropic.com";
  return key ? new ClaudeClient(key, env.AI_MODEL?.trim() || "claude-haiku-5-5", `${base}/v1/messages`) : null;
}

/** Claude via the Anthropic Messages API, with the answer constrained to a JSON schema. */
export class ClaudeClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly endpoint = "https://api.anthropic.com/v1/messages",
  ) {}

  async json<T>(req: AiRequest): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens ?? 4000,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
          output_config: { format: { type: "json_schema", schema: req.schema } },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new AiFailed("The AI service couldn't be reached. Try again in a moment.");
    }
    if (res.status === 401 || res.status === 403) throw new AiUnavailable("The AI key isn't valid. Check ANTHROPIC_API_KEY.");
    if (res.status === 429 || res.status === 529) throw new AiFailed("The AI service is busy right now. Try again in a minute.");
    if (!res.ok) throw new AiFailed("The AI service couldn't complete this. Try again.");

    const body = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
    if (body.stop_reason === "refusal") throw new AiFailed("The AI declined this request. Check the job description and try again.");
    if (body.stop_reason === "max_tokens") throw new AiFailed("The answer was too long. Try a shorter job description.");
    const text = body.content?.find((b) => b.type === "text")?.text;
    if (!text) throw new AiFailed("The AI service returned nothing. Try again.");
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AiFailed("The AI answer couldn't be read. Try again.");
    }
  }
}
