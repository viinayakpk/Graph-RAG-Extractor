---
name: branch-namer
description: Suggest a git branch name for a new feature, fix, or task in the Graph-RAG-Extractor project. Use before starting any new piece of work.
---

# Branch Namer

Suggest a branch name based on what the user is about to work on.

## Format

```
<type>/<short-kebab-description>
```

## Types for This Project

| Type | When to use |
|---|---|
| `feat` | New pipeline module, new skill, new graph schema |
| `fix` | Bug in parser, chunker, extractor, consolidator, or RAG layer |
| `eval` | New evaluation metric, ground truth data, harness improvement |
| `chore` | Deps, env config, gitignore, Docker, CI |
| `refactor` | Internal cleanup with no behaviour change |
| `docs` | CLAUDE.md, README, inline docs |
| `schema` | Changes to `schemas/requirement.json` or graph node/relationship definitions |
| `experiment` | Trying out a new parser, OCR engine, or graph DB — not yet committed to |

## Rules

- All lowercase, hyphens only — no underscores, no slashes within the description
- Keep description under 5 words
- If it touches a specific pipeline layer, name that layer: e.g., `feat/mineru-parser-adapter`, `fix/chunker-table-boundary`, `eval/recall-at-k-harness`
- For assessment/demo branches: prefix with `demo/`

## Output

Suggest 2–3 options and explain the tradeoff (e.g., more specific vs. more general). Let the user pick.

## After Naming — Full Branch Workflow

Once the user picks a branch name, the workflow is:

```bash
git checkout -b <chosen-branch-name>

# ... do the work, stage specific files ...

git add <files>
git commit -m "type(scope): summary"
git push -u origin <chosen-branch-name>

# Preserve ALL remaining work before switching context:
git stash --include-untracked    # --include-untracked / -u is MANDATORY
                                 # plain `git stash` silently drops untracked files

git checkout main && git pull
git checkout <chosen-branch-name>
git rebase main
```

**Never omit `--include-untracked`.** Untracked files (new files not yet staged) are invisible to a plain stash and will be left stranded when you switch branches.
