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
  // Keep the original indices: they're what onUpdate addresses.
  const groups = DISH_TYPES.map((type) => ({
    type,
    entries: dishes
      .map((dish, index) => ({ dish, index }))
      .filter(({ dish }) => (dish.group ?? dish.dish_type) === type.value),
  })).filter((group) => group.entries.length > 0);

  return (
    <div>
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
