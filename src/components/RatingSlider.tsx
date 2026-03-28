import { RATING_LABELS, getRatingLabel, getRatingColor } from '../types';

interface RatingSliderProps {
  value: number;
  onChange: (val: number) => void;
}

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  const label = getRatingLabel(value);
  const color = getRatingColor(value);

  return (
    <div className="rating-slider">
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="rating-marks">
        {Object.entries(RATING_LABELS).map(([num, lbl]) => (
          <span key={num} className="rating-mark">{lbl}</span>
        ))}
      </div>
    </div>
  );
}
