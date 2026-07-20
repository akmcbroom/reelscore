---
name: sync-docs
description: Audit recent code changes against the docs/ set (PRD, ARCHITECTURE, ROADMAP) and README.md to find documentation that is out of sync with the current codebase.
user-invocable: true
disable-model-invocation: true
---

# Sync Docs

Audit the `docs/` set and README.md against the current codebase to find
documentation drift. CLAUDE.md is a slim index — details live in `docs/`.

## Workflow

1. **Gather recent changes** — Run `git diff HEAD~5 --stat` and
   `git log --oneline -10` to see what files changed recently.

2. **Read the docs**, focusing on the sections that commonly drift:
   - `docs/ARCHITECTURE.md` — file map vs. actual `src/` tree; conventions;
     data model vs. `src/lib/server/db/schema.ts`; caching description vs.
     `src/lib/server/scores.ts` + `src/lib/server/cache.ts`
   - `docs/PRD.md` — feature descriptions (feed, title card, modal, search,
     auth, watchlist) vs. current implementation
   - `docs/ROADMAP.md` — are completed tasks ticked? Is the NEXT task accurate?
   - `CLAUDE.md` — commands and hard rules still correct?

3. **Cross-reference** against the actual codebase:
   - the Hono app in `src/lib/server/api.ts` vs. documented API surface
   - `ls src/lib/components src/lib src/routes` vs. the ARCHITECTURE file map
   - `package.json` dependencies vs. the ARCHITECTURE stack table (and each
     new dep has a DECISIONS.md entry)
   - Read key implementation files to verify feature descriptions

4. **Check README.md** — high-level stack/feature claims still true.

5. **Report findings** — a clear list of:
   - What's out of sync (with file + section)
   - What needs to be added, updated, or removed
   - Suggested edits (but do NOT make changes — just report)

## Rules

- This skill is **read-only** — do not edit any files, only report findings.
- Focus on meaningful drift, not cosmetic differences.
- Group findings by doc file for easy review.
- If everything is in sync, say so clearly.
