import { useMemo } from 'react';
import { useListStore } from '../store/useListStore';
import { INDIAN_GROCERY_SUGGESTIONS } from '../data/indianGrocerySuggestions';

export interface SuggestionItem {
  name:       string;
  category:   string;
  lastPrice?: number;
  avgPrice?:  number;
  source:     'history' | 'common';
}

/**
 * Returns up to 8 suggestions matching the query.
 * History items (with known prices) appear first, then common items.
 * Requires at least 2 characters to return results.
 */
export function useItemSuggestions(query: string): SuggestionItem[] {
  const richPriceHistory = useListStore(s => s.richPriceHistory);

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    // 1. From purchase history — items the user has actually bought
    const historySuggestions: SuggestionItem[] = Object.entries(richPriceHistory)
      .filter(([key]) => key.includes(q))
      .map(([, record], idx) => {
        // Find the original capitalised name from the common list or use title-cased key
        const common = INDIAN_GROCERY_SUGGESTIONS.find(
          s => s.name.toLowerCase().includes(q) &&
               richPriceHistory[s.name.toLowerCase()] !== undefined
        );
        return {
          name:      common?.name ?? Object.keys(richPriceHistory)[idx],
          category:  common?.category ?? 'Other',
          lastPrice: record.lastPrice,
          avgPrice:  record.avgPrice,
          source:    'history' as const,
        };
      });

    // 2. From common Indian grocery list — exclude items already in history results
    const historyNames = new Set(historySuggestions.map(s => s.name.toLowerCase()));
    const commonSuggestions: SuggestionItem[] = INDIAN_GROCERY_SUGGESTIONS
      .filter(s => s.name.toLowerCase().includes(q) && !historyNames.has(s.name.toLowerCase()))
      .map(s => ({
        name:     s.name,
        category: s.category,
        source:   'common' as const,
      }));

    return [...historySuggestions, ...commonSuggestions].slice(0, 8);
  }, [query, richPriceHistory]);
}
