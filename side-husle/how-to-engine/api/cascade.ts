// Serverless endpoint: POST /api/cascade  { task: string }
// Runs the Agentic Cascade server-side so provider API keys never reach the
// browser. Deploy on Vercel/Netlify functions (Node runtime).

import { AgentCascadeService } from '../src/services/AgentCascadeService';

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let task = '';
  try {
    task = (await req.json())?.task?.toString().trim() || '';
  } catch {
    /* ignore */
  }
  if (!task) return json({ error: 'Missing "task"' }, 400);

  try {
    const result = await new AgentCascadeService().run(task);
    return json(result, 200);
  } catch (e) {
    // Log the detail server-side; return only a generic message so internal
    // stack/trace information is never exposed to the client (CodeQL).
    console.error('[cascade]', e);
    return json({ error: 'The cascade failed to run. Please try again.' }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
