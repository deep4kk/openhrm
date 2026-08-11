import "server-only";

/**
 * Gemini, over plain `fetch`.
 *
 * No SDK. The whole integration is one POST with a JSON body, and the Google
 * client library would add a dependency an auditor has to read in order to
 * verify what this app sends to a third party. Here that is visible in forty
 * lines.
 *
 * Two properties this module is built around:
 *
 *  1. **Absence of a key is a supported state, not an error.** A fresh clone
 *     has no `GEMINI_API_KEY`. Everything in the documents module works without
 *     it — templates are written by hand — and the UI says so plainly instead
 *     of failing. `isConfigured()` is what the screens branch on.
 *
 *  2. **The model name is configuration.** Model identifiers are renamed and
 *     retired on Google's schedule, not ours. `GEMINI_MODEL` overrides the
 *     default so a self-hoster can move to a new one without waiting for a
 *     release of this app.
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_MODEL = "gemini-3.6-flash";

export function isConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function model(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/** Raised for every failure mode below, with a message safe to show a user. */
export class GeminiError extends Error {}

interface GenerateOptions {
  systemInstruction: string;
  prompt: string;
  /**
   * A JSON Schema (Google's OpenAPI subset). When present the model is put in
   * JSON mode and the reply is parsed rather than pattern-matched out of prose.
   */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/**
 * One request/response round trip. Returns the model's text.
 *
 * Errors are deliberately translated into short sentences an HR admin can act
 * on. The raw provider message goes to the server log, not to the screen — it
 * routinely contains the project id and the full request echo.
 */
export async function generate(options: GenerateOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError(
      "AI drafting is not configured. Set GEMINI_API_KEY in your environment to enable it.",
    );
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: options.prompt }] }],
    systemInstruction: { parts: [{ text: options.systemInstruction }] },
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      ...(options.responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: options.responseSchema,
          }
        : {}),
    },
  };

  // A hung request must not hold a server action open indefinitely; the user is
  // sitting in front of a spinner.
  const timeout = AbortSignal.timeout(60_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/${encodeURIComponent(model())}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Header rather than ?key= so the secret stays out of any URL that a
        // proxy or error tracker might log.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new GeminiError("The AI request timed out. Try again, or write the template by hand.");
    }
    console.error("[gemini] request failed", error);
    throw new GeminiError("Could not reach the AI service. Check the server's network access.");
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;

  if (!response.ok) {
    console.error("[gemini] error response", {
      status: response.status,
      message: payload?.error?.message,
    });

    if (response.status === 400 && payload?.error?.message?.includes("API key")) {
      throw new GeminiError("The Gemini API key was rejected. Check GEMINI_API_KEY.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new GeminiError("The Gemini API key was rejected. Check GEMINI_API_KEY.");
    }
    if (response.status === 404) {
      throw new GeminiError(
        `The model "${model()}" is not available for this key. Set GEMINI_MODEL to one that is.`,
      );
    }
    if (response.status === 429) {
      throw new GeminiError("The AI service is rate limiting this key. Wait a moment and retry.");
    }
    throw new GeminiError("The AI service returned an error. See the server log for details.");
  }

  if (payload?.promptFeedback?.blockReason) {
    throw new GeminiError(
      "The AI declined to answer that request. Try rewording what the letter should say.",
    );
  }

  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

  if (!text.trim()) {
    // MAX_TOKENS with no text means the model spent its budget before writing
    // anything usable — worth saying, because the fix is a shorter brief.
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new GeminiError("The AI response was cut short. Try a shorter, more specific brief.");
    }
    throw new GeminiError("The AI returned an empty response. Try again.");
  }

  return text;
}

/**
 * `generate` with a JSON schema, parsed.
 *
 * JSON mode makes malformed output rare but not impossible, and the fenced-code
 * fallback below costs three lines — worth it to avoid failing a request over a
 * stray ```json wrapper.
 */
export async function generateJson<T>(options: GenerateOptions & {
  responseSchema: Record<string, unknown>;
}): Promise<T> {
  const text = await generate(options);
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    console.error("[gemini] unparseable JSON response", { text: text.slice(0, 500) });
    throw new GeminiError("The AI returned a malformed response. Try again.");
  }
}

/** What the UI shows when AI drafting is unavailable. */
export function configurationHint(): string {
  return "Set GEMINI_API_KEY in your .env to draft templates with AI. Templates can be written by hand without it.";
}
