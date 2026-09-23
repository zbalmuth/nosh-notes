import { useState } from 'react';
import { Check, AlertCircle, ChevronDown, Pencil } from 'lucide-react';
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

// One row of an imported menu.
//
// Declared at module scope on purpose: nesting it inside AddDishPage made React
// treat it as a new component type on every parent render, remounting every row
// and pulling focus out of the name field after a single keystroke.
//
// An untouched row is only the dish name and an empty tick — fifty of these
// have to stay readable. Tapping it picks the dish, and everything else
// (rate or want-to-try, the score, the course, notes) unfolds underneath.
export function ScannedDishCard({
  dish,
  onUpdate,
}: {
  dish: ScannedDish;
  onUpdate: (updates: Partial<ScannedDish>) => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const selected = dish.action !== 'ignore';
  const typeLabel = DISH_TYPES.find((t) => t.value === dish.dish_type)?.label;

  return (
    <div className={`menu-item ${selected ? 'selected' : ''} ${dish.action === 'want_to_try' ? 'want' : ''}`}>
      {renaming ? (
        <div style={{ padding: '10px 14px' }}>
          <input
            className="menu-item-rename"
            value={dish.name}
            aria-label="Dish name"
            autoFocus
            onChange={(e) => onUpdate({ name: e.target.value })}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setRenaming(false); }}
          />
        </div>
      ) : (
        <button
          className="menu-item-head"
          aria-pressed={selected}
          onClick={() => onUpdate({ action: selected ? 'ignore' : 'want_to_try' })}
        >
          <span className="menu-item-name">{dish.name}</span>
          {dish.duplicate && (
            <span className="menu-dup" title={`Already saved as “${dish.duplicate}”`}>
              <AlertCircle size={11} />
              Saved
            </span>
          )}
          <span className="menu-tick">
            <Check size={13} strokeWidth={3} />
          </span>
        </button>
      )}

      {selected && (
        <div className="menu-item-body">
          <div className="menu-seg">
            <button
              className={dish.action === 'want_to_try' ? 'on want' : ''}
              onClick={() => onUpdate({ action: 'want_to_try' })}
            >
              Want to try
            </button>
            <button
              className={dish.action === 'rate' ? 'on' : ''}
              onClick={() => onUpdate({ action: 'rate' })}
            >
              Rate it
            </button>
          </div>

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

          {/* The course the analyzer picked, and the way to correct it */}
          <div className="menu-meta-row">
            <button
              className={`menu-type-btn ${typeOpen ? 'open' : ''}`}
              onClick={() => setTypeOpen((open) => !open)}
            >
              {typeLabel ?? 'Pick a course'}
              <ChevronDown
                size={12}
                style={{ transform: typeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>
            <button className="menu-type-btn" onClick={() => setRenaming(true)}>
              <Pencil size={11} />
              Rename
            </button>
          </div>

          {typeOpen && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -6 }}>
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
      )}
    </div>
  );
}
