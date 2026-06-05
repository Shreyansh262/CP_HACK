// Maps noisy low-level Codeforces tags into a fixed set of human-readable
// categories. A problem belongs to a category if ANY of its tags maps to it
// (so a problem can count toward several). Unmapped tags → 'Other'.

export const CATEGORY_MAP: Record<string, string> = {
  // Binary Search
  'binary search': 'Binary Search',
  'ternary search': 'Binary Search',
  // Two Pointers / Sliding Window
  'two pointers': 'Two Pointers / Sliding Window',
  // Strings
  'strings': 'Strings',
  'string suffix structures': 'Strings',
  'hashing': 'Strings',
  'expression parsing': 'Strings',
  // Bit Manipulation
  'bitmasks': 'Bit Manipulation',
  // Greedy
  'greedy': 'Greedy',
  // Dynamic Programming
  'dp': 'Dynamic Programming',
  // Graphs
  'graphs': 'Graphs',
  'dfs and similar': 'Graphs',
  'shortest paths': 'Graphs',
  'flows': 'Graphs',
  'graph matchings': 'Graphs',
  'dsu': 'Graphs',
  '2-sat': 'Graphs',
  // Trees
  'trees': 'Trees',
  // Math
  'math': 'Math',
  'number theory': 'Math',
  'combinatorics': 'Math',
  'probabilities': 'Math',
  'chinese remainder theorem': 'Math',
  'fft': 'Math',
  'geometry': 'Math',
  'matrices': 'Math',
  // Data Structures
  'data structures': 'Data Structures',
  // Sorting
  'sortings': 'Sorting',
  // Divide & Conquer
  'divide and conquer': 'Divide & Conquer',
  'meet-in-the-middle': 'Divide & Conquer',
  // Constructive
  'constructive algorithms': 'Constructive',
  // Implementation
  'implementation': 'Implementation',
  'brute force': 'Implementation',
  // Games
  'games': 'Games',
};

// Anything not in CATEGORY_MAP → 'Other'
export const OTHER_CATEGORY = 'Other';

/** Every CF tag that maps to a category (lowercase). */
export const ALL_MAPPED_TAGS: string[] = Object.keys(CATEGORY_MAP);

/** Ordered, de-duplicated canonical category list, with 'Other' pinned last. */
export const CATEGORIES: string[] = [
  ...new Set(Object.values(CATEGORY_MAP)),
  OTHER_CATEGORY,
];

/** Distinct categories a problem belongs to. Falls back to ['Other'] only when
 *  no tag matched any category. */
export function categoriesForTags(tags: string[]): string[] {
  const found = new Set<string>();
  for (const raw of tags ?? []) {
    const cat = CATEGORY_MAP[raw.trim().toLowerCase()];
    if (cat) found.add(cat);
  }
  return found.size > 0 ? [...found] : [OTHER_CATEGORY];
}

// Lazily-built inverse: category → CF tags that map to it.
let inverseMap: Record<string, string[]> | null = null;
function buildInverse(): Record<string, string[]> {
  if (inverseMap) return inverseMap;
  const inv: Record<string, string[]> = {};
  for (const [tag, cat] of Object.entries(CATEGORY_MAP)) {
    (inv[cat] ??= []).push(tag);
  }
  inverseMap = inv;
  return inv;
}

/** All CF tags that map to a category. 'Other' returns [] (caller handles it
 *  specially as "no mapped tag"). */
export function tagsForCategory(category: string): string[] {
  if (category === OTHER_CATEGORY) return [];
  return buildInverse()[category] ?? [];
}
