/**
 * VoiceParser — modular, rule-based grocery transcript parser.
 *
 * Handles English + Indian regional language inputs from voice commands.
 * No NLP libraries — pure regex + lookup tables.
 *
 * Pipeline:
 *   normalize → splitItems → (per item) mapAlias → extractQuantity → extractItemName
 */

import type { ParsedItem } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. normalize
// Lowercase, replace commas with "and", collapse whitespace.
// ─────────────────────────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/,/g, ' and ')     // commas → "and" for uniform splitting
    .replace(/[.!?]/g, ' ')     // strip punctuation
    .replace(/\s+/g, ' ')       // collapse multiple spaces
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. splitItems
// Split on explicit conjunctions, then on implied item boundaries
// (Whisper sometimes omits commas: "1 kg rice 2 litres milk").
// ─────────────────────────────────────────────────────────────────────────────

export function splitItems(text: string): string[] {
  // Split on explicit conjunctions
  const byConjunction = text.split(
    /\band\b|\bthen\b|\baur\b|\bphir\b|\balso\b|\bplus\b/i,
  );

  const result: string[] = [];
  for (const segment of byConjunction) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    // Further split when a new "NUMBER unit" starts mid-phrase
    const parts = trimmed.split(
      /(?=\b(?:\d+(?:\.\d+)?|half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:kilo(?:gram)?s?|kg|grams?|g\b|gms?|litres?|liters?|l\b|ml|pack(?:et)?s?|pieces?|pcs|bunches?|dozens?|bottles?|cans?|boxes?))/i,
    );
    result.push(...parts.map(p => p.trim()).filter(p => p.length > 1));
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Word → number mapping
// ─────────────────────────────────────────────────────────────────────────────

const WORD_NUMBERS: Record<string, number> = {
  'half':    0.5,
  'quarter': 0.25,
  'one':     1,   'two':    2,  'three': 3,
  'four':    4,   'five':   5,  'six':   6,
  'seven':   7,   'eight':  8,  'nine':  9,
  'ten':     10,  'eleven': 11, 'twelve': 12,
  'dozen':   12,
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Unit normalisation table (raw input → standard unit)
// ─────────────────────────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  // Weight
  'kilo': 'kg', 'kilos': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'kg': 'kg', 'kgs': 'kg',
  'gram': 'g', 'grams': 'g', 'gm': 'g', 'gms': 'g', 'g': 'g',
  // Volume
  'litre': 'L', 'litres': 'L', 'liter': 'L', 'liters': 'L', 'l': 'L',
  'ml': 'ml', 'mls': 'ml', 'millilitre': 'ml', 'milliliter': 'ml',
  // Count / packaging
  'packet': 'pack', 'packets': 'pack', 'pack': 'pack', 'packs': 'pack',
  'piece': 'pcs',   'pieces': 'pcs',   'pcs': 'pcs',
  'bunch': 'bunch', 'bunches': 'bunch',
  'dozen': 'doz',   'dozens': 'doz',
  'bottle': 'btl',  'bottles': 'btl',
  'can': 'can',     'cans': 'can',
  'box': 'box',     'boxes': 'box',
  'loaf': 'loaf',   'loaves': 'loaf',
  'bar': 'bar',     'bars': 'bar',
  'strip': 'strip', 'strips': 'strip',
};

// Sort longest first so "kilograms" matches before "kg"
const UNITS_RE = Object.keys(UNIT_MAP)
  .sort((a, b) => b.length - a.length)
  .join('|');

const WORD_NUM_RE = Object.keys(WORD_NUMBERS)
  .sort((a, b) => b.length - a.length)
  .join('|');

// ─────────────────────────────────────────────────────────────────────────────
// 5. mapAlias — regional language → English grocery name
// Covers Hindi, Telugu, Tamil, Kannada (romanised transliteration).
// Longest phrases matched first to avoid partial-word collisions.
// ─────────────────────────────────────────────────────────────────────────────

const ALIAS_MAP: Record<string, string> = {
  // ── English synonyms / Whisper normalization ─────────────────────────────
  'brinjal': 'eggplant', 'lady finger': 'okra', 'ladies finger': 'okra',
  'ladyfinger': 'okra', 'coriander leaves': 'coriander', 'curry leaf': 'curry leaves',
  'bottle gourd': 'bottle gourd', 'bitter gourd': 'bitter gourd', 'ridge gourd': 'ridge gourd',
  'flat beans': 'flat beans', 'kidney bean': 'kidney beans', 'black gram': 'urad dal',
  'green gram': 'moong dal', 'bengal gram': 'chana dal', 'pigeon pea': 'toor dal',
  'chickpea': 'chana', 'chickpeas': 'chana', 'semolina': 'rava',
  'wheat flour': 'wheat flour', 'refined flour': 'maida', 'rock salt': 'salt',
  'table salt': 'salt', 'cooking oil': 'oil', 'groundnut oil': 'oil',
  'turmeric powder': 'turmeric', 'chili powder': 'chili', 'chilli powder': 'chili',
  'cumin seeds': 'cumin', 'mustard seeds': 'mustard', 'fenugreek seeds': 'fenugreek',
  'sesame seeds': 'sesame',

  // ── Hindi ────────────────────────────────────────────────────────────────
  'makki ka atta': 'corn flour', 'kadi patta': 'curry leaves', 'hari mirch': 'green chili',
  'lal mirch': 'red chili', 'kali mirch': 'black pepper', 'shimla mirch': 'capsicum',
  'tej patta': 'bay leaf', 'cheeni': 'sugar', 'chini': 'sugar', 'cheeniya': 'sugar', 'aata': 'wheat flour',
  'atta': 'wheat flour', 'chawal': 'rice', 'gehu': 'wheat', 'gehun': 'wheat',
  'tel': 'oil', 'namak': 'salt', 'doodh': 'milk', 'dudh': 'milk',
  'tamatar': 'tomatoes', 'tamataro': 'tomatoes', 'pyaz': 'onion', 'piaz': 'onion',
  'aloo': 'potato', 'aalu': 'potato', 'alu': 'potato',
  'bhindi': 'okra', 'baingan': 'brinjal', 'lauki': 'bottle gourd',
  'tinda': 'round gourd', 'karela': 'bitter gourd', 'turai': 'ridge gourd',
  'sem': 'flat beans', 'mirch': 'chili', 'sarson': 'mustard', 'imli': 'tamarind',
  'maida': 'refined flour', 'suji': 'semolina', 'sooji': 'semolina',
  'khoya': 'mawa', 'mawa': 'mawa', 'saunf': 'fennel', 'hing': 'asafoetida',
  'tejpatta': 'bay leaf', 'elaichi': 'cardamom', 'laung': 'cloves',
  'dalchini': 'cinnamon', 'jaiphal': 'nutmeg', 'til': 'sesame',
  'mungfali': 'peanuts', 'kaju': 'cashew', 'badam': 'almonds',
  'anda': 'eggs', 'ande': 'eggs', 'nariyal': 'coconut', 'kela': 'banana',
  'aam': 'mango', 'papita': 'papaya', 'tarbooz': 'watermelon',
  'angoor': 'grapes', 'santara': 'orange', 'nimbu': 'lemon',
  'anar': 'pomegranate', 'ananas': 'pineapple', 'amrud': 'guava',
  'chaas': 'buttermilk', 'makki': 'corn', 'sewai': 'vermicelli',
  'sevai': 'vermicelli', 'sabun': 'soap', 'surf': 'detergent',

  // ── Telugu ───────────────────────────────────────────────────────────────
  'chakkera': 'sugar', 'chakera': 'sugar', 'chekkera': 'sugar', 'pindi': 'flour', 'nune': 'oil', 'uppu': 'salt',
  'palu': 'milk', 'paalu': 'milk', 'perugu': 'curd', 'neyyi': 'ghee',
  'vennela': 'butter', 'majjiga': 'buttermilk', 'guddu': 'eggs', 'guddlu': 'eggs',
  'kobbari': 'coconut', 'vankaya': 'brinjal', 'bendakaya': 'okra',
  'kakarakaya': 'bitter gourd', 'beerakaya': 'ridge gourd', 'potlakai': 'snake gourd',
  'chikkudu': 'flat beans', 'aratikaya': 'raw banana', 'allam': 'ginger',
  'velluli': 'garlic', 'ullipaya': 'onion', 'ullipayalu': 'onion',
  'kothimera': 'coriander', 'karivepaku': 'curry leaves',
  'menthulu': 'fenugreek', 'senagapindi': 'chickpea flour', 'inguva': 'asafoetida',
  'nuvvulu': 'sesame', 'pallilu': 'peanuts', 'jeedipappu': 'cashew',
  'biyyam': 'rice', 'goduma': 'wheat', 'rava': 'semolina', 'pasupu': 'turmeric',
  'jeelakarra': 'cumin', 'miriyalu': 'pepper', 'lavangalu': 'cloves',
  'yalakulu': 'cardamom', 'pesarapappu': 'moong dal', 'kandipappu': 'toor dal',
  'senagapappu': 'chana dal', 'pappu': 'dal', 'mamidi': 'mango', 'arati': 'banana',
  'boppayi': 'papaya', 'danimma': 'pomegranate', 'draksha': 'grapes',
  'nimmakaya': 'lemon', 'sabbu': 'soap',
  // user-provided aliases
  'averakai': 'beans', 'avarekai': 'beans', 'chintapandu': 'tamarind',
  'menasinakai': 'chili', 'mirapakaya': 'chili', 'mirapakayalu': 'chili', 'takkali': 'tomatoes',

  // ── Tamil ────────────────────────────────────────────────────────────────
  'sakkarai': 'sugar', 'maavu': 'flour', 'ennai': 'oil', 'paal': 'milk',
  'thayir': 'curd', 'vennai': 'butter', 'nei': 'ghee', 'mor': 'buttermilk',
  'muttai': 'eggs', 'thengai': 'coconut', 'thakkali': 'tomatoes',
  'vengayam': 'onion', 'urulaikizhangu': 'potato', 'poondu': 'garlic',
  'kothamalli': 'coriander', 'kariveppilai': 'curry leaves',
  'vendhayam': 'fenugreek', 'pavakkai': 'bitter gourd', 'peerkangai': 'ridge gourd',
  'pudalangai': 'snake gourd', 'avarakkai': 'flat beans', 'vazhakkai': 'raw banana',
  'kathirikkai': 'brinjal', 'vendaikkai': 'okra', 'murungakkai': 'drumstick',
  'arisi': 'rice', 'godhumai': 'wheat', 'ravai': 'semolina', 'semiya': 'vermicelli',
  'milagai': 'chili', 'pachai milagai': 'green chili', 'vara milagai': 'red chili',
  'manjal': 'turmeric', 'seeragam': 'cumin', 'kadugu': 'mustard',
  'kirambu': 'cloves', 'elakkai': 'cardamom', 'pattai': 'cinnamon',
  'perungayam': 'asafoetida', 'ellu': 'sesame', 'verkadalai': 'peanuts',
  'munthiri': 'cashew', 'paruppu': 'dal', 'manga': 'mango',
  'vazhapazham': 'banana', 'pappali': 'papaya', 'mathulam': 'pomegranate',
  'thirakshai': 'grapes', 'elumichai': 'lemon',

  // ── Kannada ──────────────────────────────────────────────────────────────
  'sakkare': 'sugar', 'sakre': 'sugar', 'hittu': 'flour', 'yenne': 'oil', 'enne': 'oil',
  'haalu': 'milk', 'halu': 'milk', 'mosaru': 'curd', 'benne': 'butter',
  'tuppa': 'ghee', 'majjige': 'buttermilk', 'motte': 'eggs', 'thengu': 'coconut',
  'badnekai': 'brinjal', 'bendekai': 'okra', 'hagalakai': 'bitter gourd',
  'heerekai': 'ridge gourd', 'padavalangai': 'snake gourd', 'avarekalu': 'flat beans',
  'balekai': 'raw banana', 'shunti': 'ginger', 'bellulli': 'garlic', 'eerulli': 'onion',
  'kottambari': 'coriander', 'karibevu': 'curry leaves', 'menthya': 'fenugreek',
  'nuggekai': 'drumstick', 'akki': 'rice', 'arishina': 'turmeric',
  'jeerige': 'cumin', 'sasive': 'mustard', 'lavanga': 'cloves', 'elakki': 'cardamom',
  'chakke': 'cinnamon', 'ingu': 'asafoetida', 'yellu': 'sesame',
  'kadalekai': 'peanuts', 'togari bele': 'toor dal', 'hesaru bele': 'moong dal',
  'kadale bele': 'chana dal', 'bellam': 'jaggery', 'bella': 'jaggery',
  'maavina hannu': 'mango', 'bale hannu': 'banana',
  'daalimbe': 'pomegranate', 'drakshi': 'grapes', 'nimbe hannu': 'lemon',
  'sabu': 'soap',
};

// Sort longest first — "shimla mirch" must match before "mirch"
const _aliasPhrases = Object.keys(ALIAS_MAP).sort((a, b) => b.length - a.length);

export function mapAlias(text: string): string {
  let result = text.toLowerCase();
  for (const phrase of _aliasPhrases) {
    const re = new RegExp(`\\b${phrase.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'g');
    result = result.replace(re, ALIAS_MAP[phrase]);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. extractQuantity
// Tries multiple patterns in priority order.
// Returns { quantity, unit, rest } where rest = item name text.
// ─────────────────────────────────────────────────────────────────────────────

interface QuantityResult {
  quantity: number;
  unit:     string;   // normalised unit string, e.g. 'kg', 'L', '' if none
  rest:     string;   // remaining text = item name
}

export function extractQuantity(text: string): QuantityResult {
  const num  = `(\\d+(?:\\.\\d+)?)`;
  const word = `(${WORD_NUM_RE})`;
  const unit = `(${UNITS_RE})`;

  const resolveNum  = (s: string) => parseFloat(s);
  const resolveWord = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? 1;
  const resolveUnit = (s: string) => UNIT_MAP[s.toLowerCase()] ?? s.toLowerCase();

  let m: RegExpMatchArray | null;

  // 1. NUM UNIT NAME          → "1 kg sugar", "500g tomatoes"
  m = text.match(new RegExp(`^${num}\\s*${unit}\\s+(.+)$`, 'i'));
  if (m) return { quantity: resolveNum(m[1]), unit: resolveUnit(m[2]), rest: m[3].trim() };

  // 2. NUM NAME UNIT          → "2 milk packets", "3 bread loaves"
  m = text.match(new RegExp(`^${num}\\s+(.+?)\\s+${unit}$`, 'i'));
  if (m) return { quantity: resolveNum(m[1]), unit: resolveUnit(m[3]), rest: m[2].trim() };

  // 3. WORD UNIT NAME         → "half kg tomato", "one litre milk"
  m = text.match(new RegExp(`^${word}\\s+${unit}\\s+(.+)$`, 'i'));
  if (m) return { quantity: resolveWord(m[1]), unit: resolveUnit(m[2]), rest: m[3].trim() };

  // 4. WORD NAME              → "three eggs", "two bread"
  m = text.match(new RegExp(`^${word}\\s+(.+)$`, 'i'));
  if (m) return { quantity: resolveWord(m[1]), unit: '', rest: m[2].trim() };

  // 5. NUM NAME               → "2 milk", "4 paneer"
  m = text.match(new RegExp(`^${num}\\s+(.+)$`));
  if (m) return { quantity: resolveNum(m[1]), unit: '', rest: m[2].trim() };

  // 6. NAME NUM UNIT          → "milk 2 litres", "tomatoes 500g"
  m = text.match(new RegExp(`^(.+?)\\s+${num}\\s*${unit}$`, 'i'));
  if (m) return { quantity: resolveNum(m[2]), unit: resolveUnit(m[3]), rest: m[1].trim() };

  // 7. NAME NUM               → "milk 2", "eggs 6"
  m = text.match(new RegExp(`^(.+?)\\s+${num}$`));
  if (m) return { quantity: resolveNum(m[2]), unit: '', rest: m[1].trim() };

  // 8. No quantity found      → "paneer", "coriander"
  return { quantity: 1, unit: '', rest: text.trim() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. extractItemName
// Removes stray numbers/units left in the rest string, capitalises.
// ─────────────────────────────────────────────────────────────────────────────

export function extractItemName(rest: string): string {
  const cleaned = rest
    .replace(new RegExp(`\\b(${UNITS_RE})\\b`, 'gi'), '')  // remove leftover units
    .replace(/\b\d+(?:\.\d+)?\b/g, '')                    // remove leftover numbers
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Category detection
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Vegetables: [
    'tomato','tomatoes','onion','onions','potato','potatoes','spinach',
    'palak','coriander','dhania','cucumber','garlic','ginger','adrak',
    'carrot','capsicum','cabbage','cauliflower','broccoli','beans',
    'peas','corn','mushroom','beetroot','radish','okra','gourd','pumpkin',
    'eggplant','brinjal','bitter gourd','karela','fenugreek','methi',
    'mint','pudina','celery','lettuce','kale','leek','drumstick',
    'snake gourd','ridge gourd','bottle gourd','raw banana','flat beans',
    'curry leaves','green chili','red chili',
  ],
  Dairy: [
    'milk','curd','yogurt','dahi','paneer','butter','ghee','cream',
    'cheese','lassi','chaas','buttermilk','condensed milk','skimmed milk','mawa',
  ],
  Fruits: [
    'apple','banana','mango','orange','grapes','watermelon','papaya',
    'guava','pomegranate','strawberry','kiwi','pear','plum','peach',
    'lemon','lime','coconut','pineapple','litchi','tamarind',
  ],
  Snacks: [
    'chips','biscuit','biscuits','cookie','cookies','namkeen','mixture',
    'chakli','wafer','wafers','popcorn','murmura','crackers',
    'peanuts','cashew','almonds','raisins','dates','nuts',
    'chocolate','dark chocolate','milk chocolate','white chocolate',
    'cocoa','candy','toffee','sweets','mithai','ladoo','barfi','halwa',
  ],
  Grains: [
    'rice','wheat','flour','maida','rava','sooji','oats','poha','daliya',
    'barley','millet','ragi','jowar','bajra','atta','besan','cornflour',
    'semolina','vermicelli','corn flour',
    'sugar','jaggery','gur','brown sugar','powdered sugar',
  ],
  Pulses: [
    'dal','lentils','chana','rajma','kidney beans','black beans',
    'moong','masoor','toor','urad','chhole','chickpeas','soya',
    'moong dal','toor dal','chana dal','urad dal',
  ],
  Spices: [
    'salt','pepper','turmeric','haldi','cumin','jeera','mustard',
    'cinnamon','cardamom','cloves','bay leaf','chilli','chili','paprika',
    'garam masala','saffron','nutmeg','tamarind','honey',
    'fennel','asafoetida','sesame','coriander','oregano','basil','thyme',
  ],
  Bakery: [
    'bread','bun','buns','pav','cake','muffin','toast','rusk','pita',
    'tortilla','croissant','bagel','doughnut','donut','pastry',
  ],
  Beverages: [
    'tea','coffee','juice','water','soda','cola','squash','syrup',
    'coconut water','energy drink','protein shake','green tea','chai',
  ],
  'Oils & Sauces': [
    'oil','sunflower oil','mustard oil','coconut oil','olive oil',
    'vinegar','ketchup','sauce','mayonnaise','soy sauce','pickle','jam',
  ],
  Cleaning: [
    'soap','shampoo','detergent','surf','ariel','washing powder',
    'dish wash','vim','broom','mop','toilet cleaner','dettol','sanitizer',
  ],
  'Personal Care': [
    'toothpaste','toothbrush','colgate','shaving','razor','lotion',
    'moisturiser','moisturizer','face wash','body wash','deodorant',
  ],
};

export function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'Other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Format qty string for display: "1kg", "2L", "3", "0.5kg"
// ─────────────────────────────────────────────────────────────────────────────

function formatQty(quantity: number, unit: string): string {
  // Show 0.5 as "0.5", 1.0 as "1"
  const q = quantity % 1 === 0 ? String(quantity) : String(quantity);
  return unit ? `${q}${unit}` : q;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedQty {
  amount: number;
  unit: string;
}

const QTY_RE = /^(\d+(?:\.\d+)?)([a-zA-Z]+)?$/;

function parseQty(qty: string): ParsedQty | null {
  const match = qty.trim().match(QTY_RE);
  if (!match) return null;
  return {
    amount: parseFloat(match[1]),
    unit: match[2] ?? '',
  };
}

function getQtyFamily(unit: string): 'weight' | 'volume' | 'count' | null {
  if (!unit) return 'count';
  if (unit === 'g' || unit === 'kg') return 'weight';
  if (unit === 'ml' || unit === 'L') return 'volume';
  if (
    unit === 'pack' || unit === 'pcs' || unit === 'bunch' || unit === 'doz' ||
    unit === 'btl' || unit === 'can' || unit === 'box' || unit === 'loaf' ||
    unit === 'bar' || unit === 'strip'
  ) return 'count';
  return null;
}

function toBaseAmount(amount: number, unit: string, family: 'weight' | 'volume' | 'count'): number {
  if (family === 'weight') return unit === 'kg' ? amount * 1000 : amount;
  if (family === 'volume') return unit === 'L' ? amount * 1000 : amount;
  return amount;
}

function formatMergedQty(amount: number, unit: string, family: 'weight' | 'volume' | 'count'): string {
  if (family === 'weight') {
    if (amount >= 1000) return formatQty(amount / 1000, 'kg');
    return formatQty(amount, 'g');
  }
  if (family === 'volume') {
    if (amount >= 1000) return formatQty(amount / 1000, 'L');
    return formatQty(amount, 'ml');
  }
  return formatQty(amount, unit);
}

export function getParsedItemMergeKey(item: ParsedItem): string | null {
  const parsedQty = parseQty(item.qty);
  if (!parsedQty) return null;

  const family = getQtyFamily(parsedQty.unit);
  if (!family) return null;

  return `${item.name.trim().toLowerCase()}::${family}`;
}

export function mergeParsedItems(items: ParsedItem[]): ParsedItem[] {
  const merged: ParsedItem[] = [];
  const seen = new Map<string, number>();

  for (const item of items) {
    const key = getParsedItemMergeKey(item);
    const parsedQty = parseQty(item.qty);

    if (!key || !parsedQty) {
      merged.push(item);
      continue;
    }

    const family = getQtyFamily(parsedQty.unit);
    if (!family) {
      merged.push(item);
      continue;
    }

    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      merged.push(item);
      seen.set(key, merged.length - 1);
      continue;
    }

    const existing = merged[existingIndex];
    const existingQty = parseQty(existing.qty);
    if (!existingQty) {
      merged.push(item);
      continue;
    }

    const existingFamily = getQtyFamily(existingQty.unit);
    if (existingFamily !== family) {
      merged.push(item);
      continue;
    }

    const total = toBaseAmount(existingQty.amount, existingQty.unit, family)
      + toBaseAmount(parsedQty.amount, parsedQty.unit, family);

    merged[existingIndex] = {
      ...existing,
      qty: formatMergedQty(total, existingQty.unit || parsedQty.unit, family),
    };
  }

  return merged;
}

/** Parse a single item string. Returns null if name is empty. */
export function parseItemText(raw: string): ParsedItem | null {
  if (!raw.trim()) return null;
  const aliased           = mapAlias(raw.trim());
  const { quantity, unit, rest } = extractQuantity(aliased);
  const name              = extractItemName(rest);
  if (!name || name.length < 2) return null;
  return { name, qty: formatQty(quantity, unit), category: detectCategory(name) };
}

/** Parse a full transcript with multiple items. */
export function parseTranscript(transcript: string): ParsedItem[] {
  const normalised = normalize(transcript);
  const segments   = splitItems(normalised);
  return segments
    .map(seg => parseItemText(seg))
    .filter((item): item is ParsedItem => item !== null);
}

/** Parse a pre-split list (one item per line, from the Add Item text field). */
export function parseBulkText(text: string): ParsedItem[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(parseItemText)
    .filter((item): item is ParsedItem => item !== null);
}
