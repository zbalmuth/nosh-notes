import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Trash2 } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RatingSlider } from '../components/RatingSlider';
import { uploadPhoto } from '../lib/api';
import { DISH_TYPES } from '../types';
import type { DishType, Dish } from '../types';

export function EditDishPage() {
  const { restaurantId, dishId } = useParams<{ restaurantId: string; dishId: string }>();
  const navigate = useNavigate();
  const { updateDish, deleteDish, getDishes, restaurants, showToast } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const restaurant = restaurants.find((r) => r.id === restaurantId);

  const [dish, setDish] = useState<Dish | null>(null);
  const [name, setName] = useState('');
  const [dishType, setDishType] = useState<DishType>('entree');
  const [wantToTry, setWantToTry] = useState(false);
  const [rating, setRating] = useState(7);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingDish, setLoadingDish] = useState(true);

  useEffect(() => {
    if (restaurantId && dishId) {
      getDishes(restaurantId).then((dishes) => {
        const found = dishes.find((d) => d.id === dishId);
        if (found) {
          setDish(found);
          setName(found.name);
          setDishType(found.dish_type as DishType);
          setWantToTry(found.want_to_try);
          setRating(found.rating ?? 7);
          setNotes(found.notes || '');
          setPhotos(found.photos || []);
        }
        setLoadingDish(false);
      });
    }
  }, [restaurantId, dishId, getDishes]);

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setPhotos((prev) => [...prev, ev.target!.result as string]);
      }
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim() || !dishId) return;
    setSaving(true);
    try {
      const uploadedPhotos: string[] = [];
      for (const photo of photos) {
        if (photo.startsWith('data:')) {
          try {
            const blob = await fetch(photo).then((r) => r.blob());
            const file = new File([blob], `dish-${Date.now()}.jpg`, { type: 'image/jpeg' });
            const url = await uploadPhoto(file, 'dish-photos', `${restaurantId}/${file.name}`);
            uploadedPhotos.push(url);
          } catch {
            uploadedPhotos.push(photo);
          }
        } else {
          uploadedPhotos.push(photo);
        }
      }

      await updateDish(dishId, {
        name: name.trim(),
        dish_type: dishType,
        want_to_try: wantToTry,
        rating: wantToTry ? null : rating,
        notes,
        photos: uploadedPhotos,
      });
      showToast('Dish updated!');
      navigate(`/restaurant/${restaurantId}`);
    } catch (err) {
      console.error('Failed to update dish', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!dishId) return;
    if (confirm(`Delete "${name}"?`)) {
      await deleteDish(dishId);
      navigate(`/restaurant/${restaurantId}`);
    }
  };

  if (loadingDish) {
    return (
      <div className="app-container">
        <div className="loading-spinner" style={{ flex: 1 }} />
      </div>
    );
  }

  if (!dish) {
    return (
      <div>
        <div className="page-header">
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}>
            <ArrowLeft size={22} />
          </button>
          <h1>Dish not found</h1>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Edit Dish</h1>
        <button
          onClick={handleDelete}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
        >
          <Trash2 size={20} />
        </button>
      </div>

      {restaurant && (
        <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
          at <strong style={{ color: 'var(--text-primary)' }}>{restaurant.name}</strong>
        </div>
      )}

      <div style={{ padding: '16px 20px 100px' }}>
        {/* Camera */}
        <div className="form-group">
          <label>Photos</label>
          <button className="camera-btn" onClick={() => fileInputRef.current?.click()}>
            <Camera size={20} />
            Add Photo
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

        {/* Photo previews */}
        {photos.length > 0 && (
          <div className="form-group">
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={p} alt={`Photo ${i + 1}`} />
                  <button
                    onClick={() => removePhoto(i)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: 'rgba(0,0,0,0.6)', border: 'none',
                      borderRadius: '50%', width: 22, height: 22,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
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

        {/* Want to Try */}
        <div className="form-group">
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              background: wantToTry ? 'linear-gradient(135deg, var(--neon-pink), var(--cyan))' : 'var(--bg-secondary)',
              borderRadius: 'var(--radius)',
              border: `2px solid ${wantToTry ? 'var(--cyan)' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onClick={() => setWantToTry(!wantToTry)}
          >
            <span style={{ fontFamily: "'Righteous', cursive", fontSize: 15, color: wantToTry ? 'var(--white)' : 'var(--text-secondary)' }}>
              ✨ Want to Try
            </span>
            <div style={{ width: 44, height: 24, borderRadius: 12, background: wantToTry ? 'rgba(255,255,255,0.3)' : 'var(--border)', position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: wantToTry ? 'var(--white)' : 'var(--text-muted)', position: 'absolute', top: 2, left: wantToTry ? 22 : 2, transition: 'left 0.2s' }} />
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
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
