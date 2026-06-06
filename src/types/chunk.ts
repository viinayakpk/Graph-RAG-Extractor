export type DocumentRegion = "section" | "lv-position" | "vorbemerkungen";

export type DocumentStrategy =
  | "section-list"
  | "lv-position"
  | "vorbemerkungen-heavy"
  | "mixed";

export interface Chunk {
  chunk_id: string;
  source_file: string;
  page_number: number | string;
  section_heading: string | null;
  lv_position: string | null;
  document_region: DocumentRegion;
  category_code: string | null;
  content: string;
}
