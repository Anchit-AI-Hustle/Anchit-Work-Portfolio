// Serverless endpoint: Text-to-Video broker (Web Request/Response handler shape;
// named GET/POST exports so Vercel serves it as a fetch-style function).
//   POST /api/text-to-video      { stepId, prompt, seconds?, aspect? }  -> queue
//   GET  /api/text-to-video?jobId=...                                  -> poll
//
// Provider-agnostic WRAPPER. Wire the fetch calls to Runway / Luma / Sora using
// whichever key is set. Until then it returns a graceful mock so the UI renders
// animated placeholders instead of breaking.

export const config = { runtime: 'nodejs' };

const env = (k: string) => process.env?.[k] || '';

export async function GET(req: Request): Promise<Response> {
  const jobId = new URL(req.url).searchParams.get('jobId') || '';
  // Real impl: query the provider's job status here. Mock → immediately ready.
  return json({ stepId: jobId, status: 'ready', url: mockClip(jobId), posterUrl: mockPoster(jobId) });
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { stepId, prompt, seconds = 5, aspect = '16:9' } = body as {
    stepId: string; prompt: string; seconds?: number; aspect?: string;
  };
  if (!prompt) return json({ error: 'Missing prompt' }, 400);

  // ── Runway example (uncomment + set RUNWAY_API_KEY) ──────────────────────
  // if (env('RUNWAY_API_KEY')) {
  //   const r = await fetch('https://api.runwayml.com/v1/text_to_video', {
  //     method: 'POST',
  //     headers: { authorization: `Bearer ${env('RUNWAY_API_KEY')}`, 'content-type': 'application/json' },
  //     body: JSON.stringify({ promptText: prompt, duration: seconds, ratio: aspect }),
  //   });
  //   const j = await r.json();
  //   return json({ stepId, status: 'rendering', url: j.id }); // url carries jobId for polling
  // }

  void env; void seconds; void aspect;
  // Mock: pretend the job is queued; the GET poll returns it ready.
  return json({ stepId, status: 'queued', url: stepId });
}

// Deterministic pretty gradient poster (data URI) so placeholders look intentional.
function mockPoster(seed: string): string {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='hsl(${h} 80% 55%)'/><stop offset='1' stop-color='hsl(${(h + 60) % 360} 80% 45%)'/>
    </linearGradient></defs><rect width='640' height='360' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
function mockClip(seed: string): string {
  // No real bytes in mock mode — the UI falls back to the animated poster.
  return mockPoster(seed);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
