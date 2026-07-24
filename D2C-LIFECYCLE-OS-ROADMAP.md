# D2C-LifeCycle-OS — Roadmap: 10 Marketing Skills

Direction (from Anchit): grow D2C-LifeCycle-OS beyond the one-shot lifecycle plan
into a suite of modular, paste-in marketing **skills**. Each is a focused tool:
paste an input, get a sharp, structured output. Default subject stays
anchit-tandon.com; every skill also works for any brand.

Implementation shape: extend `api/lifecycle.js` (or add `api/skill.js`) with a
`skill` param that routes to per-skill prompts + deterministic templates + the
same free LLM cascade, and add a skill picker to `d2c-lifecycle-os.html`.

| # | Skill | Input → Output | Status in current OS |
|---|-------|----------------|----------------------|
| 1 | **Campaign audit** | Paste campaign data → wasted spend + leaks | NEW |
| 2 | **Landing page audit** | Paste a URL → headline + CTA fixes | NEW (LP Agent is related but different) |
| 3 | **A/B test analyzer** | Paste results → significance + next test | NEW |
| 4 | **Competitor teardown** | Paste a rival's page → angles to beat them | PARTIAL — industry benchmarks + competitor set exist; per-rival teardown is new |
| 5 | **UTM generator** | Describe the campaign → clean tracking spec | NEW |
| 6 | **Email sequence** | Give ICP + offer → full nurture flow | PARTIAL — retention flows + calendar exist; dedicated ICP→sequence is cleaner |
| 7 | **Content repurposer** | Give one post → thread, email, hooks | NEW |
| 8 | **ICP builder** | Paste product + quotes → sharp ICP | PARTIAL — audience segments exist; a single sharp ICP is new |
| 9 | **Ad copy matrix** | Give a brief → 20 ad-copy variations | PARTIAL — mailer variants + scoring exist; scale to 20 ad variants |
| 10 | **Creative brief** | Give an angle → designer-ready brief | PARTIAL — designed mailer exists; a standalone creative brief is new |

## Notes
- Keep the deterministic-fallback discipline: every skill returns a usable
  output with no API key set (demo must never fail).
- Reuse the industry-benchmark layer (SimilarWeb / SEMrush, env-gated) to ground
  Campaign audit, Competitor teardown and Ad copy matrix.
- Reuse the Smart-Brain scoring pattern for Ad copy matrix (score each variant).
- Add per-skill Export/Copy (already built for the plan).
