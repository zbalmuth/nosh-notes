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
// order you'd eat them. The section headings double as the analyzer's answer
// for every dish under them, so a misfiled dish is obvious at a glance — and
// correcting one moves it into the right course.
export function ScannedDishList({
  dishes,
  onUpdate,
}: {
  dishes: ScannedDish[];
  onUpdate: (index: number, updates: Partial<ScannedDish>) => void;
}) {
  // Keep the original indices: they're what onUpdate addresses.
  const groups = DISH_TYPES.map((type) => ({
    type,
    entries: dishes
      .map((dish, index) => ({ dish, index }))
      .filter(({ dish }) => dish.dish_type === type.value),
  })).filter((group) => group.entries.length > 0);

  return (
    <div>
      {groups.map(({ type, entries }) => (
        <section key={type.value}>
          <header className="menu-section">
            <span className="menu-section-label">{COURSE_HEADINGS[type.value]}</span>
            <span className="menu-section-rule" />
            <span className="menu-section-count">{entries.length}</span>
          </header>
          {entries.map(({ dish, index }) => (
            <ScannedDishCard
              key={index}
              dish={dish}
              onUpdate={(updates) => onUpdate(index, updates)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
