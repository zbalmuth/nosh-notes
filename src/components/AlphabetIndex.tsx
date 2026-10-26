import { useState } from 'react';
import { INDEX_LETTERS } from '../lib/alphabet';

// A Contacts-style A–Z strip down the right edge. Tap or drag along it to jump
// the list; a letter with no restaurants jumps to the next one that has some.
//
// Each list section it can jump to must carry data-index-letter="<letter>".
export function AlphabetIndex({ present, descending }: { present: Set<string>; descending: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const letters = descending ? [...INDEX_LETTERS].reverse() : INDEX_LETTERS;

  const jumpTo = (letter: string) => {
    const from = letters.indexOf(letter);
    const target = letters.slice(from).find((l) => present.has(l));
    if (!target) return;
    setActive(letter);
    document
      .querySelector(`[data-index-letter="${target}"]`)
      ?.scrollIntoView({ block: 'start' });
  };

  // Read the letter under the finger rather than the touch target, which stays
  // the one first touched for the whole drag.
  const handleTouch = (e: React.TouchEvent) => {
    e.stopPropagation(); // keep the home page's pull-to-refresh out of it
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const letter = el?.dataset.letter;
    if (letter && letter !== active) jumpTo(letter);
  };

  return (
    <>
      <div
        className="alpha-index"
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={(e) => { e.stopPropagation(); setActive(null); }}
      >
        {letters.map((letter) => (
          <button
            key={letter}
            data-letter={letter}
            className={present.has(letter) ? '' : 'empty'}
            onClick={() => { jumpTo(letter); setActive(null); }}
            aria-label={`Jump to ${letter}`}
          >
            {letter}
          </button>
        ))}
      </div>
      {active && <div className="alpha-index-bubble">{active}</div>}
    </>
  );
}
