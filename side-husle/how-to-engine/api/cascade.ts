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
    return json({ error: String((e as Error).message || e) }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
