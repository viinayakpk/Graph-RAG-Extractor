---
name: commit-writer
description: Write a conventional git commit message for the current staged changes in the Graph-RAG-Extractor project. Use when you need a clean, meaningful commit before pushing or opening a PR.
---

# Commit Writer

Write a conventional commit message for the current staged diff in this project.

## Branch Workflow — MANDATORY (do this every time, no exceptions)

```
1. git checkout -b <branch-name>          # NEVER commit directly to main
2. git add <specific files>               # stage only what belongs in this commit
3. git commit -m "..."                    # use conventional format below
4. git push -u origin <branch-name>       # push the branch
5. git stash --include-untracked          # CRITICAL: -u flag preserves ALL untracked files
                                          # plain `git stash` silently drops untracked files
6. git checkout main && git pull          # update main
7. git checkout <branch-name>
8. git rebase main                        # rebase branch onto updated main
```

`git stash --include-untracked` (also `git stash -u`) is NON-NEGOTIABLE.  
Plain `git stash` does NOT stash untracked files — they are silently left behind and can be lost.  
Every workflow step that involves a stash must use `--include-untracked`.

## Process

1. Run `git diff --staged` to see what is actually staged.
2. Run `git log --oneline -5` to match the existing commit style in this repo.
3. Identify the primary change type:
   - `feat` — new pipeline module, new skill, new schema
   - `fix` — bug in parsing, chunking, extraction, or consolidation
   - `chore` — deps, config, env files, gitignore
   - `refactor` — same behaviour, cleaner code
   - `test` — eval harness, ground truth data
   - `docs` — CLAUDE.md, README, inline comments
4. Write the message in this format:
   ```
   <type>(<scope>): <short imperative summary under 72 chars>

   <optional body: WHY this change was made, not WHAT — max 3 lines>
   ```
5. Scopes for this project: `parser`, `chunker`, `extractor`, `consolidator`, `rag`, `schema`, `eval`, `graph`, `config`, `deps`, `skills`

## Rules

- Subject line is imperative mood: "add", "fix", "remove" — not "added", "fixes", "removing"
- Never mention file names in the subject — scopes cover that
- If the diff touches more than one layer (e.g., extractor + schema), use the primary changed layer as scope
- Body explains the "why": a constraint, a bug root cause, a tradeoff — not a list of changed files
- Do NOT include "Co-Authored-By" lines unless explicitly asked

## Output

Print the final commit message in a code block, then ask: "Shall I run `git commit -m` with this message?"
