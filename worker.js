// Cloudflare host for anchit-tandon.com. Static pages come from www/ (the same
// build Vercel serves). Only the paths listed in wrangler.jsonc `run_worker_first`
// reach this script; everything else is served straight from the assets.
//
// The serverless functions in api/ only run on Vercel, so /api/* is passed to
// the Vercel production alias, which keeps answering even when Vercel cannot
// take a new deployment. If Vercel is unreachable the API returns a 503 and the
// site's chat falls back to its offline answers.
const VERCEL = 'https://anchit-work-portfolio-anchit-ai-hustle.vercel.app';

// Mirrors the external rewrites in vercel.json.
const EXTERNAL = [
  ['/linkedin-auto-pilot', 'https://linkedin-auto-pilot.vercel.app/linkedin-auto-pilot'],
  ['/money-minter', 'https://money-minter-rose.vercel.app/money-minter'],
  ['/markets-pro', 'https://markets-pro.vercel.app/markets-pro'],
];

async function pass(request, target, isApi) {
  try {
    return await fetch(new Request(target, request), { redirect: 'manual' });
  } catch (err) {
    return isApi
      ? new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      : new Response('Temporarily unavailable', { status: 503 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;

    if (path === '/teleprompter' || path === '/teleprompter/') {
      return Response.redirect('https://teleprompter.anchit-tandon.com/', 308);
    }
    if (path.startsWith('/how-to/api/')) path = path.slice('/how-to'.length);
    if (path.startsWith('/api/')) return pass(request, VERCEL + path + url.search, true);

    for (const [prefix, dest] of EXTERNAL) {
      if (path === prefix || path.startsWith(prefix + '/')) {
        return pass(request, dest + path.slice(prefix.length) + url.search, false);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
