// ── Model provider adapters (SERVER-SIDE ONLY) ─────────────────────────────
// Each adapter turns a (system, user) prompt into raw text. Keys come from the
// environment and never touch the browser. Providers are RANKED by published
// benchmark accuracy; the cascade fans out to the top N in parallel.
//
// Claude uses the official Anthropic SDK (@anthropic-ai/sdk). The others use
// their REST endpoints via fetch so the file stays dependency-light — swap in
// each vendor's official SDK if you prefer, the interface is identical.

import Anthropic from '@anthropic-ai/sdk';

export interface ModelProvider {
  id: string;                 // stable id, e.g. "claude-opus-4-8"
  label: string;              // display name
  rank: number;               // 1 = highest benchmark accuracy
  enabled: () => boolean;     // has a key configured?
  /** Returns the model's raw text answer. Throws on failure. */
  call: (system: string, user: string) => Promise<string>;
}

const env = (k: string) => (typeof process !== 'undefined' ? process.env?.[k] : undefined) || '';

// ── Anthropic · Claude Opus 4.8 (top-ranked; also the evaluator/synthesizer) ─
const anthropic: ModelProvider = {
  id: 'claude-opus-4-8',
  label: 'Claude Opus 4.8',
  rank: 1,
  enabled: () => !!env('ANTHROPIC_API_KEY'),
  async call(system, user) {
    const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
    // Adaptive thinking is the current default for hard reasoning on 4.6+ models.
    // The pinned SDK's types predate the "adaptive" thinking mode (they only know
    // "enabled"/"disabled"), so cast the value — the API accepts it at runtime.
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      thinking: { type: 'adaptive' } as unknown as Anthropic.ThinkingConfigParam,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return (msg.content as Array<{ type: string; text?: string }>)
      .map((b) => (b.type === 'text' ? b.text ?? '' : ''))
      .join('\n');
  },
};

// ── OpenAI · GPT-5 ─────────────────────────────────────────────────────────
const openai: ModelProvider = {
  id: 'gpt-5',
  label: 'GPT-5',
  rank: 2,
  enabled: () => !!env('OPENAI_API_KEY'),
  async call(system, user) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env('OPENAI_API_KEY')}` },
      body: JSON.stringify({
        model: 'gpt-5',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!r.ok) throw new Error(`openai ${r.status}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? '';
  },
};

// ── Google · Gemini 2.5 Pro ────────────────────────────────────────────────
const gemini: ModelProvider = {
  id: 'gemini-2.5-pro',
  label: 'Gemini 2.5 Pro',
  rank: 3,
  enabled: () => !!env('GEMINI_API_KEY'),
  async call(system, user) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${env('GEMINI_API_KEY')}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ?? '';
  },
};

// ── xAI · Grok 4 ───────────────────────────────────────────────────────────
const grok: ModelProvider = {
  id: 'grok-4',
  label: 'Grok 4',
  rank: 4,
  enabled: () => !!env('XAI_API_KEY'),
  async call(system, user) {
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env('XAI_API_KEY')}` },
      body: JSON.stringify({
        model: 'grok-4',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!r.ok) throw new Error(`grok ${r.status}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? '';
  },
};

/** Ranked registry. Ranking is benchmark-driven and fully config-swappable. */
export const PROVIDERS: ModelProvider[] = [anthropic, openai, gemini, grok].sort((a, b) => a.rank - b.rank);

/** The strongest available model is used as the consensus/evaluator node. */
export function evaluatorProvider(): ModelProvider {
  return PROVIDERS.find((p) => p.enabled()) ?? anthropic;
}
