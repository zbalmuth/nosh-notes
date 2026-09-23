import { useState } from 'react';
import { Check, Sparkles, AlertCircle, Tag, ChevronDown } from 'lucide-react';
import { RatingSlider } from './RatingSlider';
import { ScrollBar } from './ScrollBar';
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

// ─── Shared dish card for the Menu + Scan tabs ───────────────────────────────
// Declared at module scope on purpose: nesting it inside AddDishPage made React
// treat it as a new component type on every parent render, remounting each card
// and pulling focus out of the name field after a single keystroke.
export function ScannedDishCard({
  dish,
  onUpdate,
}: {
  dish: ScannedDish;
  onUpdate: (updates: Partial<ScannedDish>) => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const selected = dish.action !== 'ignore';
  const typeLabel = DISH_TYPES.find((t) => t.value === dish.dish_type)?.label;

  return (
    <div
      className="card"
      style={{
        padding: 14,
        marginBottom: 10,
        border: selected ? '2px solid var(--hot-pink)' : '2px solid var(--border)',
        opacity: selected ? 1 : 0.62,
        transition: 'all 0.2s',
      }}
    >
      {/* Duplicate warning */}
      {dish.duplicate && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: 'var(--coral)',
          background: 'rgba(255,100,60,0.08)', borderRadius: 6,
          padding: '4px 8px', marginBottom: 8,
        }}>
          <AlertCircle size={12} style={{ flexShrink: 0 }} />
          Similar to &ldquo;{dish.duplicate}&rdquo; already in your list
        </div>
      )}

      {/* Dish name — editable */}
      <input
        className="input"
        value={dish.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        style={{ fontFamily: "'Righteous', cursive", fontSize: 15, marginBottom: 8, padding: '6px 10px' }}
      />

      {/* Dish type — the analyzer's guess, one tap to correct */}
      <button
        onClick={() => setTypeOpen((open) => !open)}
        className={`chip ${typeOpen ? 'active' : ''}`}
        style={{ marginBottom: typeOpen ? 8 : 0, fontSize: 12, padding: '3px 10px' }}
      >
        <Tag size={11} />
        {typeLabel ?? 'Pick a type'}
        <ChevronDown
          size={11}
          style={{ transform: typeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </button>
      {typeOpen && (
        <ScrollBar className="filter-bar" style={{ marginBottom: 10 }}>
          {DISH_TYPES.map((type) => (
            <button
              key={type.value}
              className={`dish-type-pill ${dish.dish_type === type.value ? 'active' : ''}`}
              onClick={() => { onUpdate({ dish_type: type.value }); setTypeOpen(false); }}
              style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: 12, padding: '5px 13px' }}
            >
              {type.label}
            </button>
          ))}
        </ScrollBar>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: selected ? 10 : 0 }}>
        <button
          className={`chip ${dish.action === 'rate' ? 'active' : ''}`}
          onClick={() => onUpdate({ action: dish.action === 'rate' ? 'ignore' : 'rate' })}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Check size={12} />
          Rate
        </button>
        <button
          className={`chip ${dish.action === 'want_to_try' ? 'active' : ''}`}
          onClick={() => onUpdate({ action: dish.action === 'want_to_try' ? 'ignore' : 'want_to_try' })}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Sparkles size={12} />
          Want to Try
        </button>
      </div>

      {/* Rating with numeric display */}
      {dish.action === 'rate' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <span style={{
              fontFamily: "'Righteous', cursive",
              fontSize: 13,
              color: getRatingColor(dish.rating),
              background: `${getRatingColor(dish.rating)}18`,
              padding: '2px 12px',
              borderRadius: 12,
              border: `1.5px solid ${getRatingColor(dish.rating)}40`,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              {getRatingLabel(dish.rating)} &middot; {dish.rating.toFixed(1)}/10
            </span>
          </div>
          <RatingSlider value={dish.rating} onChange={(val) => onUpdate({ rating: val })} />
        </>
      )}

      {/* Notes — only once the dish is actually going in */}
      {selected && (
        <textarea
          className="input"
          placeholder="Add notes (optional)"
          value={dish.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          rows={2}
          style={{ marginTop: 10, fontSize: 13, resize: 'none' }}
        />
      )}
    </div>
  );
}
