import type { ConsolidatedRequirement } from "../types/requirement.js";

export interface Group {
  l1Key: string;
  l1Label: string;
  l2Key: string;
  l2Label: string;
  requirements: ConsolidatedRequirement[];
}

// Derive L1/L2 grouping keys from a consolidated requirement
// Strategy: use category_code if present; fall back to bullet_point prefix words
function l1l2From(req: ConsolidatedRequirement): { l1Key: string; l1Label: string; l2Key: string; l2Label: string } {
  if (req.category_code) {
    // Salzburg: category_code like "07" → L1 = "Technical Requirements", L2 = category name
    return {
      l1Key: "technical",
      l1Label: "Technical Requirements",
      l2Key: req.category_code,
      l2Label: req.category_code,
    };
  }

  // Christmas / general: group by first word of bullet_point as L2, all under one L1
  const words = req.bullet_point.split(/\s+/);
  const l2Key = words.slice(0, 2).join("_").toLowerCase().replace(/[^a-z0-9_]/g, "");
  return {
    l1Key: "requirements",
    l1Label: "Procurement Requirements",
    l2Key,
    l2Label: words.slice(0, 3).join(" "),
  };
}

export function discoverGroups(requirements: ConsolidatedRequirement[]): Group[] {
  const groupMap = new Map<string, Group>();

  for (const req of requirements) {
    const { l1Key, l1Label, l2Key, l2Label } = l1l2From(req);
    const key = `${l1Key}::${l2Key}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { l1Key, l1Label, l2Key, l2Label, requirements: [] });
    }
    groupMap.get(key)!.requirements.push(req);
  }

  return [...groupMap.values()];
}
