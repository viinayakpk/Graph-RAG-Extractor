export type EvidenceRole =
  | "general_spec"
  | "room_placement"
  | "quantity"
  | "maintenance"
  | "external_plan_reference"
  | "standard_citation"
  | "duplication"
  | "cross_reference";

export type MergeRule =
  | "lv-position-match"
  | "vorbemerkungen-category"
  | "staging-dedup"
  | "standalone";

export interface EvidenceLink {
  chunkId: string;
  evidenceRole: EvidenceRole;
}

export interface MergeRecord {
  rule: MergeRule;
  mergeConfidence: "high" | "medium" | "low";
  evidenceLinks: EvidenceLink[];
  whyMerged: string;
}

export interface ChunkExtraction {
  chunk_id: string;
  source_file: string;
  page_number: number | string;
  section_heading: string | null;
  bullet_point: string;
  description_en: string;
  description_de: string | null;
  priority: "must" | "should" | "optional";
  equivalence_allowed: boolean | null;
  confidence: "high" | "medium" | "low";
  standards: string[];
  referenced_annexes: string[];
  cross_referenced_positions: string[];
  category_code: string | null;
  item_number: string | null;
}

export interface ConsolidatedRequirement {
  id: string;
  source_chunk_ids: string[];
  merge_record: MergeRecord;
  bullet_point: string;
  description_en: string;
  description_de: string | null;
  priority: "must" | "should" | "optional";
  equivalence_allowed: boolean | null;
  confidence: "high" | "medium" | "low";
  standards: string[];
  referenced_annexes: string[];
  category_code: string | null;
  section_heading: string | null;
  item_number: string | null;
}
