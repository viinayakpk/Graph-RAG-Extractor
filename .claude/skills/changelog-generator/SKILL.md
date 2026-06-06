---
name: changelog-generator
description: Generate a CHANGELOG.md entry from git commit history for the Graph-RAG-Extractor project. Use before tagging a release or submitting the assessment.
---

# Changelog Generator

Generate a CHANGELOG.md entry from the commit history since the last tag or a specified base commit.

## Process

1. Run `git tag --sort=-version:refname | head -5` to find the latest tag.
2. If no tags exist, use `git log --oneline` from the first commit.
3. Run `git log <last-tag>..HEAD --pretty=format:"%h %s"` to get commits since that tag.
4. Group commits by type: `feat`, `fix`, `refactor`, `chore`, `docs`, `eval`, `schema`.
5. Filter out trivial chore commits (e.g., "chore: update .gitignore") unless they affect setup instructions.

## Output Format

```markdown
## [Unreleased] — YYYY-MM-DD

### Added
- 

### Fixed
- 

### Changed
- 

### Evaluation
- 

### Schema / Graph
- 

### Docs & Config
- 
```

## Rules

- Date is today's date
- Each line starts with a verb in past tense: "Added parser adapter for MinerU 2.x"
- Link to commit hash where it adds useful context: `([abc1234])`
- If a change affects source traceability (chunk_id / page_number / source_file), note it explicitly
- Never include WIP or fixup commits in the changelog
