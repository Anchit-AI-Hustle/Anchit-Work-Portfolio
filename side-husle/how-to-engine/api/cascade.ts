// Serverless endpoint: POST /api/cascade  { task: string }
// Runs the Agentic Cascade server-side so provider API keys never reach the
// browser. Uses the Web Request/Response handler shape via a NAMED method
// export (`POST`), which Vercel serves as a fetch-style function on the Node
// runtime — a `export default (req,res)` would be treated as legacy Node.

import { AgentCascadeService } from '../src/services/AgentCascadeService';

export const config = { runtime: 'nodejs' };

export async function POST(req: Request): Promise<Response> {
  let task = '';
  try {
    task = (await req.json())?.task?.toString().trim() || '';
  } catch {
    /* ignore malformed body */
  }
  if (!task) return json({ error: 'Missing "task"' }, 400);

  try {
    const result = await new AgentCascadeService().run(task);
    return json(result, 200);
  } catch (e) {
    // Log detail server-side; return a generic message (no stack exposure).
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
