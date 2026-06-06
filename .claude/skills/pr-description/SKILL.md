---
name: pr-description
description: Generate a structured pull request description for changes in the Graph-RAG-Extractor project. Use before opening a PR on GitHub to summarize what changed, why, and how to test it.
---

# PR Description Writer

Generate a pull request description for the current branch against `main`.

## Branch Workflow Reminder

PRs always come from a branch, never from main. Before generating the PR description:

```bash
# Ensure branch is up to date with main
git stash --include-untracked    # --include-untracked / -u is MANDATORY — never plain stash
git checkout main && git pull
git checkout <branch-name>
git rebase main
git push --force-with-lease      # safe force-push after rebase
git stash pop
```

## Process

1. Run `git log main..HEAD --oneline` to see all commits in this PR.
2. Run `git diff main...HEAD --stat` to understand the scope of changes.
3. Read any changed files in `pipeline/`, `schemas/`, `eval/`, `.claude/skills/` relevant to the PR.
4. Check `CLAUDE.md` for project conventions to ensure the PR respects them.

## Output Format

```markdown
## Summary
<!-- 2-4 bullets: what changed and why -->
- 

## Pipeline Layer Affected
<!-- Which layers does this touch? -->
- [ ] Parser
- [ ] Chunker
- [ ] Extractor
- [ ] Consolidator
- [ ] RAG / retrieval
- [ ] Schema / validation
- [ ] Evaluation
- [ ] Skills / config

## Traceability Impact
<!-- Does this change how chunk_id / page_number / source_file are tracked? -->


## Test Plan
<!-- How to verify this works. Be specific — which tender file, what to check in output -->
- [ ] 
- [ ] 

## Breaking Changes
<!-- Any changes to JSON schemas, graph node labels, env vars, or CLI args? -->
None / [describe]
```

## Rules

- Never fabricate test results — describe what to check, not what you checked
- If the PR changes the extraction schema or graph node labels, flag it explicitly under Breaking Changes
- Keep Summary bullets factual and brief — no marketing language
