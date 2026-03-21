---
name: sync-docs
description: Audit recent code changes against CLAUDE.md and README.md to find documentation that is out of sync with the current codebase.
user-invocable: true
disable-model-invocation: true
---

# Sync Docs

Audit CLAUDE.md and README.md against the current codebase to find documentation drift.

## Workflow

1. **Gather recent changes** — Run `git diff HEAD~5 --stat` and `git log --oneline -10` to see what files changed recently.

2. **Read the spec** — Read `CLAUDE.md` fully, focusing on these sections that commonly drift:
   - **Project Structure** — Does the file tree match what's actually in `src/`?
   - **API Endpoints** — Does every file in `src/pages/api/` have a corresponding entry?
   - **Features** (Title Card, Title Modal, Discovery Feed, etc.) — Do descriptions match current implementation?
   - **Tech Stack** — Any new dependencies in `package.json` not documented?
   - **Build Order** — Are completed steps marked or described accurately?

3. **Cross-reference** — For each section, verify against the actual codebase:
   - `ls src/pages/api/` vs documented API endpoints
   - `ls src/components/` vs documented components
   - `ls src/lib/` vs documented lib files
   - `cat package.json` dependencies vs documented tech stack
   - Read key implementation files to verify feature descriptions are accurate

4. **Check README.md** — Verify it reflects the same high-level features and hasn't fallen behind CLAUDE.md.

5. **Report findings** — Output a clear list of:
   - What's out of sync (with specific CLAUDE.md line numbers)
   - What needs to be added, updated, or removed
   - Suggested edits (but do NOT make changes — just report)

## Rules

- This skill is **read-only** — do not edit any files, only report findings.
- Focus on meaningful drift, not cosmetic differences.
- Group findings by CLAUDE.md section for easy review.
- If everything is in sync, say so clearly.
