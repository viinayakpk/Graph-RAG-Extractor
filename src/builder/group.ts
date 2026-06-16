import type { ConsolidatedRequirement } from "../types/requirement.js";

export interface Group {
  l1Key: string;
  l1Label: string;
  l2Key: string;
  l2Label: string;
  requirements: ConsolidatedRequirement[];
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "general";
}

// Deterministic fallback (used only when LLM grouping is unavailable): groups by the
// document's own section/category under a neutral L1, with no per-document logic.
export function discoverGroups(requirements: ConsolidatedRequirement[]): Group[] {
  const groupMap = new Map<string, Group>();
  for (const req of requirements) {
    const label =
      req.section_heading ?? (req.category_code ? `Category ${req.category_code}` : "General");
    const l2Key = slugify(label);
    const key = `requirements::${l2Key}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        l1Key: "requirements",
        l1Label: "Requirements",
        l2Key,
        l2Label: label,
        requirements: [],
      });
    }
    groupMap.get(key)!.requirements.push(req);
  }
  return [...groupMap.values()];
}
