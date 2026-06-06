---
name: prompt-governance
description: Review or version the DeepSeek extraction prompts used in the Graph-RAG-Extractor pipeline. Track token usage, validate structured output instructions, and flag prompt drift. Use when writing or modifying any LLM system/user prompt.
---

# Prompt Governance

Review and manage prompts used in the DeepSeek API extraction calls.

## Prompt Inventory

For each prompt in the project, record:
```
File:         src/extractor/prompts.ts (or similar)
Version:      v1.0
Model:        deepseek-chat (read from env DEEPSEEK_MODEL)
Purpose:      Extract requirement candidates from a single tender chunk
Input tokens (approx):
Output tokens (approx):
Last modified:
```

## Prompt Review Checklist

When reviewing a new or modified extraction prompt:

### Structure
- [ ] System prompt has clearly separated sections: role → task → output format → constraints
- [ ] Output format section includes the exact Zod schema field names (not just descriptions)
- [ ] Prompt explicitly asks for `raw_text` — the verbatim source sentence/paragraph
- [ ] Prompt specifies: "Return an empty JSON array `[]` if this chunk contains no extractable requirement"
- [ ] Prompt specifies: "Return a JSON array only — no markdown fences, no commentary"

### Extraction Quality Instructions
- [ ] Priority classification is defined with examples: "must" = mandatory knock-out, "should" = should-have, "optional" = nice-to-have
- [ ] "Or equivalent" / "oder gleichwertig" detection is explicitly instructed → `equivalenceAllowed: true`
- [ ] Prompt handles multilingual tenders — the sample files include German text
- [ ] If German text is present: `description_en` = English translation, `description_de` = original German
- [ ] Item number (LV position number like "Pos. 1.1" or "LV-Nr. 003") extraction is explicitly instructed

### DeepSeek-Specific
- [ ] Temperature is 0 or 0.1 — set in the API call, not the prompt
- [ ] Using `response_format: { type: "json_object" }` if the DeepSeek version supports it
- [ ] `max_tokens` is capped at a sane limit (2048 is usually enough for chunk extraction)
- [ ] System prompt is passed as the `system` role, chunk as `user` role

### Token Efficiency
- [ ] System prompt is under 800 tokens — count manually or via the DeepSeek token counter if available
- [ ] The chunk is passed as the user message, not embedded in the system prompt
- [ ] If running many chunks: consider caching the system prompt in the API call (check DeepSeek caching docs)
- [ ] Log token usage from the API response: `response.usage.prompt_tokens`, `response.usage.completion_tokens`

### Prompt Versioning
- [ ] Prompt strings live in `src/extractor/prompts.ts`, not inline in the calling function
- [ ] Each prompt export is named and versioned: `export const EXTRACTION_SYSTEM_PROMPT_V1 = ...`
- [ ] When changing a prompt, keep the old version commented with the date it was retired

## Output

A prompt review report: Pass / Fail / Suggestion for each checklist item. If failing, provide the corrected prompt section.
