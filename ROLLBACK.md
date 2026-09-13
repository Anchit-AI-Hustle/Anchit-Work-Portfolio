# Rollback

What to do when a deploy is wrong. Ordered fastest first; the first option is
almost always the right one.

Production is `anchit-tandon.com`, served by Vercel from `main`. Every push to
`main` deploys automatically. There is no database and no migration step, so a
rollback is a content rollback and nothing else: no data is at risk, and nothing
has to be undone in any other system.

## 1. Instant: promote the previous deployment (seconds, no git)

Vercel keeps every production deployment. Promoting an older one is immediate
and does not touch the repository.

- Vercel → project `anchit-work-portfolio` → **Deployments**
- filter to **Production**, pick the last known-good one
- **⋯ → Promote to Production** (older UI: *Rollback*)

The deployment list is the source of truth for what "last known good" means —
each row shows the commit it came from. `main` is now ahead of what is live, so
follow with option 2 or 3 to make the repository agree.

## 2. Revert the merge in git (a minute, keeps history)

Preferred when the bad change is identified and the fix is "undo that PR".

```bash
git checkout main && git pull
git revert -m 1 <merge-commit-sha>     # -m 1 keeps main's side of the merge
git push origin main                    # deploys automatically
```

`-m 1` is required for a merge commit and is easy to forget. Find the SHA on the
merged pull request, or with `git log --oneline --merges -10`.

A revert is itself a normal commit, so CI runs on it and it can be reverted in
turn if the diagnosis was wrong. That is why this is preferred over a force
push, which is never appropriate on `main`.

## 3. Roll forward (usually better than either)

Most problems here are one wrong string or one wrong rule. A small fix on a
branch, with CI green, reaches production as fast as a revert and does not
discard the rest of the release.

## After any rollback: the service worker

`sw.js` caches same-origin assets, and its cache name is stamped by the build
from a hash of the files it serves (`stampServiceWorker` in
`scripts/build-www.mjs`). Rolling back changes those bytes, so the stamp changes
too and returning visitors pick the older assets up on their next visit — assets
are stale-while-revalidate, so the first load after a rollback may still show
the newer build and the one after it will be correct.

Do not hand-edit the cache name to force this. It is generated; editing it in
source is overwritten by the next build, and a hand-written name is exactly how
the cache went a month stale in the first place (see `npm run test:sw`).

## Verifying a rollback worked

```bash
npm run build          # stamps sw.js; must succeed
npm run test:routes    # every rewrite, manifest page and sitemap URL resolves
npm run test:sitemap   # the sitemap still matches the SEO manifest
npm run test:sw        # cache name stamped, assets revalidate
```

Then check production itself: the Vercel deployment shows **Ready**, and
`/`, `/freelancer`, `/marketing-101` and `/growth-school` all return 200.

## What is NOT a rollback

- **Force-pushing `main`.** It breaks every existing checkout and every open
  pull request, and the deploy history stops matching the repository.
- **Deleting the Vercel project or its deployments.** Deployment history is what
  makes option 1 possible.
- **Rotating nothing.** If the bad deploy exposed a credential, roll back *and*
  rotate the credential: the old deployment is still publicly addressable by its
  URL, so the rollback alone does not un-publish anything it contained.
