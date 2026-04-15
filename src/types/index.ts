export interface GroceryItem {
  id:        string;
  /** Supabase UUID — set after the first successful remote sync. */
  remoteId?: string;
  name:      string;
  qty:       string;   // weight/volume descriptor e.g. "500g", "2L", "1 pack"
  count:     number;   // purchase quantity multiplier — default 1
  price:     number;   // unit price (₹)
  category:  string;
  checked:   boolean;
  createdAt: number;
}

export interface ParsedItem {
  name:      string;
  qty:       string;
  count?:    number;   // optional — defaults to 1 when not provided
  price?:    number;
  category:  string;
}

export interface TripSummary {
  id:    string;
  date:  number;
  items: GroceryItem[];
  total: number;
}

export interface Profile {
  id:              string;
  displayName:     string | null;
  storePreference: string | null;
  budget:          number | null;
  onboarded:       boolean;
}

// ── Price history (rich, local-only) ─────────────────────────────────────────

export interface PriceRecord {
  lastPrice: number;
  lastDate:  number;   // Unix ms
  avgPrice:  number;
  count:     number;   // number of times purchased
}

/** key = item name lowercased */
export type PriceHistory = Record<string, PriceRecord>;

// ── Groups ────────────────────────────────────────────────────────────────────

export interface GroupMember {
  userId:      string;
  displayName: string | null;
  role:        string;   // 'admin' | 'member'
  joinedAt:    number;   // Unix ms
}

// ── Widget data (written on every mutation, read by home-screen widget) ───────

export interface WidgetData {
  pending:   number;    // ₹ total of unchecked items
  itemCount: number;    // count of unchecked items
  items:     string[];  // first 5 unchecked item names
}
