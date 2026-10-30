/**
 * Cliente compartido de OpenRouter (Claude) para todas las funciones de IA del panel.
 * Pide siempre JSON con esquema estricto y nunca lanza: ante cualquier falla devuelve null.
 */
import "server-only";
import { z } from "zod";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
const DEFAULT_TIMEOUT_MS = 20_000;

/** Modelo en uso: OPENROUTER_MODEL o Claude Sonnet 5.5 por defecto. */
export function aiModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

/** Respuesta de OpenRouter (formato chat completions), solo los campos que se usan. */
const OpenRouterResponseSchema = z.object({
  choices: z
    .array(z.object({ finish_reason: z.string().nullish(), message: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }) }))
    .min(1),
});

export interface OpenRouterJsonOptions<T> {
  /** Prefijo de los registros, p. ej. "triage". */
  tag: string;
  /** Nombre del esquema JSON enviado al modelo. */
  name: string;
  schema: Record<string, unknown>;
  parse: z.ZodType<T>;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
}

/** Llama a Claude vía OpenRouter y devuelve el JSON validado. Null si no hay clave, falla, se rehúsa o responde fuera del formato. */
export async function callOpenRouterJson<T>(opts: OpenRouterJsonOptions<T>): Promise<T | null> {
  const { tag } = opts;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn(`[${tag}] sin OPENROUTER_API_KEY; se omite el análisis con IA`);
    return null;
  }
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Recall Collosus DH" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      body: JSON.stringify({
        model: aiModel(),
        max_tokens: opts.maxTokens,
        reasoning: { effort: "low" },
        response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: opts.schema } },
        // Solo proveedores que respetan el formato pedido y no guardan los datos para entrenar.
        provider: { require_parameters: true, data_collection: "deny" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) console.warn(`[${tag}] límite de OpenRouter; se omite el análisis con IA`);
      else console.error(`[${tag}] error de OpenRouter ${res.status}:`, (await res.text()).slice(0, 300));
      return null;
    }
    const json: unknown = await res.json();
    const data = OpenRouterResponseSchema.safeParse(json);
    if (!data.success) {
      // OpenRouter puede responder 200 con { error } en el cuerpo.
      console.error(`[${tag}] respuesta inesperada de OpenRouter:`, JSON.stringify(json).slice(0, 300));
      return null;
    }
    const choice = data.data.choices[0]!;
    if (choice.message.refusal || !choice.message.content) {
      console.warn(`[${tag}] OpenRouter no devolvió texto (finish_reason=${choice.finish_reason ?? "?"}, rehúsa=${Boolean(choice.message.refusal)})`);
      return null;
    }
    const parsed = opts.parse.safeParse(JSON.parse(choice.message.content));
    if (!parsed.success) {
      console.warn(`[${tag}] la IA respondió fuera del formato pedido`);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.error(`[${tag}] fallo del análisis con IA:`, err);
    return null;
  }
}
