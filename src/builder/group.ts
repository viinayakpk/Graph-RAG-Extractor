import type { ConsolidatedRequirement } from "../types/requirement.js";

export interface Group {
  l1Key: string;
  l1Label: string;
  l2Key: string;
  l2Label: string;
  requirements: ConsolidatedRequirement[];
}

// 3-segment numeric OZ: capture group(01) and subgroup(02) from 01.02.0030
const OZ_3PART_RE = /^(\d{2})\.(\d{2})\.\d{4}$/;
// 5-segment alphanumeric OZ: capture room(07) and category(09) from GU.07.09.01.01
const OZ_5PART_ALPHA_RE = /^[A-Z]{2}\.(\d{2})\.(\d{2})\.\d{2}\.\d{2}$/;

// Derive L1/L2 grouping keys from a consolidated requirement.
// Priority: category_code (Salzburg) → numeric OZ prefix (Fahrradgaragen) → section_heading (Christmas) → fallback
function l1l2From(req: ConsolidatedRequirement): { l1Key: string; l1Label: string; l2Key: string; l2Label: string } {
  // Salzburg vorbemerkungen and room positions carry category_code
  if (req.category_code) {
    return {
      l1Key: "technical",
      l1Label: "Technical Requirements",
      l2Key: req.category_code,
      l2Label: `Category ${req.category_code}`,
    };
  }

  // Fahrradgaragen: numeric OZ like 01.02.0030 → L1 = group 01, L2 = subgroup 01.02
  const fahrradMatch = req.item_number ? OZ_3PART_RE.exec(req.item_number) : null;
  if (fahrradMatch) {
    const grp = fahrradMatch[1]!;
    const sub = fahrradMatch[2]!;
    const l2Key = `${grp}.${sub}`;
    return {
      l1Key: grp,
      l1Label: `Group ${grp}`,
      l2Key,
      l2Label: `Subgroup ${l2Key}`,
    };
  }

  // Salzburg room positions without category_code (shouldn't happen, but covered)
  const salzburgMatch = req.item_number ? OZ_5PART_ALPHA_RE.exec(req.item_number) : null;
  if (salzburgMatch) {
    const room = salzburgMatch[1]!;
    const cat = salzburgMatch[2]!;
    return {
      l1Key: `room_${room}`,
      l1Label: `Room ${room}`,
      l2Key: `${room}_${cat}`,
      l2Label: `Room ${room} – Category ${cat}`,
    };
  }

  // Christmas / section-list: group by section heading
  if (req.section_heading) {
    const key = req.section_heading.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    return {
      l1Key: "procurement",
      l1Label: "Procurement Requirements",
      l2Key: key,
      l2Label: req.section_heading,
    };
  }

  // Last resort: first 2-3 words of bullet_point
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
