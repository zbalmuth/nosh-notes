import { useState } from 'react';
import { Check, Sparkles, AlertCircle, ChevronDown } from 'lucide-react';
import { RatingSlider } from './RatingSlider';
import { DISH_TYPES, getRatingLabel, getRatingColor } from '../types';

// A dish pulled off a menu or a photo, awaiting the user's verdict.
export interface ScannedDish {
  name: string;
  dish_type: string;
  action: 'rate' | 'want_to_try' | 'ignore';
  rating: number;
  notes: string;
  duplicate?: string; // name of a similar existing dish
}

// One line of an imported menu.
//
// Declared at module scope on purpose: nesting it inside AddDishPage made React
// treat it as a new component type on every parent render, remounting every row
// and pulling focus out of the name field after a single keystroke.
//
// An untouched row is just the dish name and two round buttons — a 50-dish menu
// has to stay scannable. Rating, notes and the type correction only appear once
// the dish is actually going in.
export function ScannedDishCard({
  dish,
  onUpdate,
}: {
  dish: ScannedDish;
  onUpdate: (updates: Partial<ScannedDish>) => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const selected = dish.action !== 'ignore';
  const typeLabel = DISH_TYPES.find((t) => t.value === dish.dish_type)?.label;

  const toggle = (action: 'rate' | 'want_to_try') =>
    onUpdate({ action: dish.action === action ? 'ignore' : action });

  return (
    <div className={`menu-row ${selected ? 'selected' : ''}`}>
      <div className="menu-row-head">
        {/* Plain text until tapped: menu names run long, and an <input> would
            silently scroll the tail of "North African Carrot Salad" out of view. */}
        {editing ? (
          <input
            className="menu-row-name"
            value={dish.name}
            aria-label="Dish name"
            autoFocus
            onChange={(e) => onUpdate({ name: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
          />
        ) : (
          <span
            className="menu-row-name as-text"
            role="button"
            tabIndex={0}
            onClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
          >
            {dish.name}
          </span>
        )}
        <button
          className={`menu-act ${dish.action === 'rate' ? 'on' : ''}`}
          onClick={() => toggle('rate')}
          aria-pressed={dish.action === 'rate'}
          aria-label={`Rate ${dish.name}`}
        >
          <Check size={17} strokeWidth={2.5} />
        </button>
        <button
          className={`menu-act want ${dish.action === 'want_to_try' ? 'on' : ''}`}
          onClick={() => toggle('want_to_try')}
          aria-pressed={dish.action === 'want_to_try'}
          aria-label={`Add ${dish.name} to want to try`}
        >
          <Sparkles size={16} strokeWidth={2.5} />
        </button>
      </div>

      {dish.duplicate && (
        <div className="menu-dup">
          <AlertCircle size={11} style={{ flexShrink: 0 }} />
          Already saved as &ldquo;{dish.duplicate}&rdquo;
        </div>
      )}

      {selected && (
        <>
          <div className="menu-row-divider" />
          <div className="menu-row-body">
            {dish.action === 'rate' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 4 }}>
                  <span style={{
                    fontFamily: "'Righteous', cursive",
                    fontSize: 12,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: getRatingColor(dish.rating),
                  }}>
                    {getRatingLabel(dish.rating)} &middot; {dish.rating.toFixed(1)}
                  </span>
                </div>
                <RatingSlider value={dish.rating} onChange={(val) => onUpdate({ rating: val })} />
              </div>
            )}

            {/* The analyzer's guess, and the way to correct it */}
            <button
              className={`menu-type-btn ${typeOpen ? 'open' : ''}`}
              onClick={() => setTypeOpen((open) => !open)}
            >
              {typeLabel ?? 'Pick a type'}
              <ChevronDown
                size={12}
                style={{ transform: typeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>
            {typeOpen && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -4 }}>
                {DISH_TYPES.map((type) => (
                  <button
                    key={type.value}
                    className={`dish-type-pill ${dish.dish_type === type.value ? 'active' : ''}`}
                    onClick={() => { onUpdate({ dish_type: type.value }); setTypeOpen(false); }}
                    style={{ fontSize: 12, padding: '5px 12px' }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            )}

            <textarea
              className="input"
              placeholder="Notes (optional)"
              value={dish.notes}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              rows={2}
              style={{ fontSize: 14, resize: 'none', padding: '9px 12px' }}
            />
          </div>
        </>
      )}
    </div>
  );
}
