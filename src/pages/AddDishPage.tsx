import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Loader } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RatingSlider } from '../components/RatingSlider';
import { analyzeDishImage, uploadPhoto } from '../lib/api';
import { DISH_TYPES } from '../types';
import type { DishType } from '../types';

export function AddDishPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const navigate = useNavigate();
  const { addDish, restaurants } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const restaurant = restaurants.find((r) => r.id === restaurantId);

  const [name, setName] = useState('');
  const [dishType, setDishType] = useState<DishType>('entree');
  const [wantToTry, setWantToTry] = useState(false);
  const [rating, setRating] = useState(7);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ name: string; dish_type: string }[]>([]);

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setPhotos((prev) => [...prev, ev.target!.result as string]);
      }
    };
    reader.readAsDataURL(file);

    // Analyze with AI
    setAnalyzing(true);
    try {
      const base64Reader = new FileReader();
      base64Reader.onload = async (ev) => {
        if (ev.target?.result) {
          const base64 = (ev.target.result as string).split(',')[1];
          try {
            const result = await analyzeDishImage(base64);
            if (result.dishes?.length > 0) {
              setAiSuggestions(result.dishes);
            }
          } catch (err) {
            console.error('AI analysis failed:', err);
          } finally {
            setAnalyzing(false);
          }
        }
      };
      base64Reader.readAsDataURL(file);
    } catch {
      setAnalyzing(false);
    }
  };

  const applySuggestion = (suggestion: { name: string; dish_type: string }) => {
    setName(suggestion.name);
    const matchedType = DISH_TYPES.find(
      (t) => t.value === suggestion.dish_type.toLowerCase()
    );
    if (matchedType) setDishType(matchedType.value);
    setAiSuggestions([]);
  };

  const handleSave = async () => {
    if (!name.trim() || !restaurantId) return;
    setSaving(true);
    try {
      // Upload photos to Supabase storage if they're base64
      const uploadedPhotos: string[] = [];
      for (const photo of photos) {
        if (photo.startsWith('data:')) {
          try {
            const blob = await fetch(photo).then((r) => r.blob());
            const file = new File([blob], `dish-${Date.now()}.jpg`, { type: 'image/jpeg' });
            const url = await uploadPhoto(file, 'dish-photos', `${restaurantId}/${file.name}`);
            uploadedPhotos.push(url);
          } catch {
            // Keep base64 as fallback
            uploadedPhotos.push(photo);
          }
        } else {
          uploadedPhotos.push(photo);
        }
      }

      await addDish({
        restaurant_id: restaurantId,
        name: name.trim(),
        dish_type: dishType,
        want_to_try: wantToTry,
        rating: wantToTry ? null : rating,
        notes,
        photos: uploadedPhotos,
      });
      navigate(`/restaurant/${restaurantId}`);
    } catch (err) {
      console.error('Failed to add dish', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--burnt-orange)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Add Dish</h1>
      </div>

      {restaurant && (
        <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
          at <strong style={{ color: 'var(--text-primary)' }}>{restaurant.name}</strong>
        </div>
      )}

      <div style={{ padding: '16px 20px 100px' }}>
        {/* Camera / AI */}
        <div className="form-group">
          <label>Scan Menu / Receipt / Dish Photo</label>
          <button className="camera-btn" onClick={() => fileInputRef.current?.click()}>
            {analyzing ? (
              <>
                <Loader size={20} className="spin" />
                Analyzing with AI...
              </>
            ) : (
              <>
                <Camera size={20} />
                Take Photo or Upload Image
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageCapture}
            style={{ display: 'none' }}
          />
        </div>

        {/* AI Suggestions */}
        {aiSuggestions.length > 0 && (
          <div className="form-group">
            <label>AI Detected Dishes</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {aiSuggestions.map((s, i) => (
                <button
                  key={i}
                  className="card"
                  style={{ textAlign: 'left', cursor: 'pointer', padding: 12 }}
                  onClick={() => applySuggestion(s)}
                >
                  <strong style={{ fontFamily: "'Righteous', cursive" }}>{s.name}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                    ({s.dish_type})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Photo previews */}
        {photos.length > 0 && (
          <div className="form-group">
            <div className="photo-grid">
              {photos.map((p, i) => (
                <img key={i} src={p} alt={`Photo ${i + 1}`} />
              ))}
            </div>
          </div>
        )}

        {/* Dish Name */}
        <div className="form-group">
          <label>Dish Name *</label>
          <input
            className="input"
            placeholder="What did you have?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Dish Type */}
        <div className="form-group">
          <label>Dish Type</label>
          <div className="dish-type-pills">
            {DISH_TYPES.map((type) => (
              <button
                key={type.value}
                className={`dish-type-pill ${dishType === type.value ? 'active' : ''}`}
                onClick={() => setDishType(type.value)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Want to Try toggle */}
        <div className="form-group">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: wantToTry
                ? 'linear-gradient(135deg, var(--mustard), var(--gold))'
                : 'var(--bg-secondary)',
              borderRadius: 'var(--radius)',
              border: `2px solid ${wantToTry ? 'var(--gold)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => setWantToTry(!wantToTry)}
          >
            <span
              style={{
                fontFamily: "'Righteous', cursive",
                fontSize: 15,
                color: wantToTry ? 'var(--cream)' : 'var(--text-secondary)',
              }}
            >
              ✨ Want to Try
            </span>
            <div
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: wantToTry ? 'rgba(255,255,255,0.3)' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: wantToTry ? 'var(--cream)' : 'var(--text-muted)',
                  position: 'absolute',
                  top: 2,
                  left: wantToTry ? 22 : 2,
                  transition: 'left 0.2s',
                }}
              />
            </div>
          </div>
        </div>

        {/* Rating */}
        {!wantToTry && (
          <div className="form-group">
            <label>Rating</label>
            <RatingSlider value={rating} onChange={setRating} />
          </div>
        )}

        {/* Notes */}
        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea
            className="input"
            placeholder="How was it? Any special thoughts?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Save */}
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 8 }}
          onClick={handleSave}
          disabled={!name.trim() || saving}
        >
          {saving ? 'Saving...' : 'Add Dish'}
        </button>
      </div>
    </div>
  );
}
