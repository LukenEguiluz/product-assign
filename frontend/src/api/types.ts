export type User = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  can_create_app_users?: boolean;
  is_superuser?: boolean;
};

export type Client = {
  id: number;
  name: string;
  client_number: string;
  created_at: string;
};

export type CatalogItem = {
  id: number;
  gtin: string;
  reference: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type CatalogListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: CatalogItem[];
};

export type CatalogImportResult = {
  error?: string | null;
  created_count: number;
  updated_count: number;
  created: { gtin: string; reference: string }[];
  updated: { gtin: string; reference: string }[];
  duplicates_in_file: { gtin: string; rows: number[] }[];
  already_in_catalog: {
    gtin: string;
    row: number;
    existing_reference: string;
    existing_description: string;
  }[];
  invalid_rows: { row: number; reason: string }[];
  skipped_duplicate_in_file_rows: number;
  update_existing: boolean;
};

export type SessionScan = {
  id: number;
  session: number;
  gtin: string;
  rfid_hex: string;
  expiry_yymmdd?: string | null;
  batch_lot?: string;
  /** Desde catálogo por GTIN (solo lectura en API). */
  reference?: string;
  description?: string;
  created_by: number;
  created_by_username?: string;
  created_at: string;
  excluded_at: string | null;
  excluded_by?: number | null;
  excluded_by_username?: string | null;
  is_excluded?: boolean;
};

export type InventorySession = {
  id: number;
  client: number;
  client_name?: string;
  cabinet: number | null;
  cabinet_name?: string | null;
  delivery_number: string;
  inventory_date: string;
  status: "draft" | "in_progress" | "completed";
  created_by: number;
  created_by_username?: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  scan_count?: number;
  scans?: SessionScan[];
};
