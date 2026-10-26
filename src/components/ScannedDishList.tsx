import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { ScannedDishCard } from './ScannedDishCard';
import type { ScannedDish } from './ScannedDishCard';
import { DISH_TYPES } from '../types';
import type { DishType } from '../types';

// A course heading reads as a group, not as one dish's label.
const COURSE_HEADINGS: Record<DishType, string> = {
  appetizer: 'Appetizers',
  salad: 'Salads',
  soup: 'Soups',
  side: 'Sides',
  entree: 'Entrées',
  drink: 'Drinks',
  dessert: 'Desserts',
};

// An imported menu, laid out the way a menu is: grouped into courses, in the
// order you'd eat them. The section headings are the analyzer's answer for
// every dish under them, so a misfiled dish is obvious at a glance.
//
// Long menus (115 dishes at New Delhi Palace) get a search box pinned above
// the list: type "paneer" rather than scroll for it. Every word typed has to
// match, in any order, ignoring case, accents and punctuation.
//
// A dish stays under the course it was first listed in (its `group`) even
// after you correct it: moving it on the spot yanked the row out from under
// your finger mid-edit. The row's own course button shows the new choice.
export function ScannedDishList({
  dishes,
  onUpdate,
  defaultAction = 'want_to_try',
}: {
  dishes: ScannedDish[];
  onUpdate: (index: number, updates: Partial<ScannedDish>) => void;
  // What tapping an untouched row picks it as.
  defaultAction?: 'rate' | 'want_to_try';
}) {
  const [query, setQuery] = useState('');
  const words = fold(query).split(' ').filter(Boolean);
  const matches = (dish: ScannedDish) => words.every((w) => fold(dish.name).includes(w));

  // Keep the original indices: they're what onUpdate addresses.
  const groups = DISH_TYPES.map((type) => ({
    type,
    entries: dishes
      .map((dish, index) => ({ dish, index }))
      .filter(({ dish }) => (dish.group ?? dish.dish_type) === type.value && matches(dish)),
  })).filter((group) => group.entries.length > 0);

  return (
    <div>
      {dishes.length >= 12 && (
        <div className="menu-search">
          <div className="search-bar" style={{ margin: 0 }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              placeholder={`Search ${dishes.length} dishes…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              inputMode="search"
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 2 }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}
      {words.length > 0 && groups.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
          No dishes match “{query}”
        </p>
      )}
      {groups.map(({ type, entries }) => (
        <section className="menu-course" key={type.value}>
          <h3 className="menu-course-label">
            {COURSE_HEADINGS[type.value]}
            <span className="menu-course-count">{entries.length}</span>
          </h3>
          <div className="menu-group">
            {entries.map(({ dish, index }) => (
              <ScannedDishCard
                key={index}
                dish={dish}
                defaultAction={defaultAction}
                onUpdate={(updates) => onUpdate(index, updates)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// Lower-case, accents off, punctuation to spaces: "Crème Brûlée" → "creme brulee".
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
