import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RatingSlider } from '../components/RatingSlider';
import { ScrollBar } from '../components/ScrollBar';
import { uploadPhoto } from '../lib/api';
import { DISH_TYPES, getRatingLabel, getRatingColor } from '../types';
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
  const [photoViewIndex, setPhotoViewIndex] = useState(0);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
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
    e.target.value = '';
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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageCapture}
        style={{ display: 'none' }}
      />

      {/* Photo fullscreen viewer */}
      {photoFullscreen && photos.length > 0 && (
        <div
          onClick={() => setPhotoFullscreen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 12,
          }}
        >
          <button
            onClick={() => setPhotoFullscreen(false)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'white', padding: 8 }}
          >
            <X size={24} />
          </button>
          <img
            src={photos[photoViewIndex]}
            alt="Dish photo"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
          />
          {photos.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                onClick={(e) => { e.stopPropagation(); setPhotoViewIndex((prev) => (prev - 1 + photos.length) % photos.length); }}
                style={{ background: 'none', border: 'none', color: 'white', padding: 8 }}
              >
                <ChevronLeft size={28} />
              </button>
              <span style={{ color: 'white', fontSize: 14, fontFamily: "'Righteous', cursive" }}>
                {photoViewIndex + 1} / {photos.length}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setPhotoViewIndex((prev) => (prev + 1) % photos.length); }}
                style={{ background: 'none', border: 'none', color: 'white', padding: 8 }}
              >
                <ChevronRight size={28} />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Edit Dish</h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
        >
          <Camera size={20} />
        </button>
      </div>

      {/* Photo hero — touches bottom of banner, restaurant name overlays */}
      {photos.length > 0 ? (
        <div style={{ position: 'relative', height: 180, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <img
            src={photos[photoViewIndex]}
            alt="Dish photo"
            onClick={() => setPhotoFullscreen(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
          />
          {/* Restaurant name overlay */}
          {restaurant && (
            <div style={{
              position: 'absolute', top: 10, left: 12,
              background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: '3px 10px',
            }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>at </span>
              <strong style={{ fontSize: 12, color: 'white' }}>{restaurant.name}</strong>
            </div>
          )}
          {/* Remove photo */}
          <button
            onClick={() => {
              removePhoto(photoViewIndex);
              setPhotoViewIndex((prev) => Math.max(0, Math.min(prev, photos.length - 2)));
            }}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
          {/* Dot indicators / swipe nav */}
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setPhotoViewIndex((prev) => (prev - 1 + photos.length) % photos.length)}
                style={{ background: 'none', border: 'none', color: 'white', padding: 2 }}
              >
                <ChevronLeft size={18} />
              </button>
              {photos.map((_, i) => (
                <div
                  key={i}
                  onClick={() => setPhotoViewIndex(i)}
                  style={{
                    width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                    background: i === photoViewIndex ? 'white' : 'rgba(255,255,255,0.4)',
                  }}
                />
              ))}
              <button
                onClick={() => setPhotoViewIndex((prev) => (prev + 1) % photos.length)}
                style={{ background: 'none', border: 'none', color: 'white', padding: 2 }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      ) : restaurant ? (
        <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
          at <strong style={{ color: 'var(--text-primary)' }}>{restaurant.name}</strong>
        </div>
      ) : null}

      <div style={{ padding: '16px 20px 100px' }}>
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

        {/* Dish Type — scrollable strip */}
        <div className="form-group">
          <label>Dish Type</label>
          <ScrollBar className="filter-bar">
            {DISH_TYPES.map((type) => (
              <button
                key={type.value}
                className={`dish-type-pill ${dishType === type.value ? 'active' : ''}`}
                onClick={() => setDishType(type.value)}
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {type.label}
              </button>
            ))}
          </ScrollBar>
        </div>

        {/* Want to Try */}
        <div className="form-group">
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: wantToTry ? 'linear-gradient(135deg, var(--neon-pink), var(--cyan))' : 'var(--bg-secondary)',
              borderRadius: 'var(--radius)',
              border: `2px solid ${wantToTry ? 'var(--cyan)' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onClick={() => setWantToTry(!wantToTry)}
          >
            <span style={{ fontFamily: "'Righteous', cursive", fontSize: 14, color: wantToTry ? 'var(--white)' : 'var(--text-secondary)' }}>
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
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ margin: 0, position: 'absolute', left: 0 }}>Rating</label>
              <span style={{
                fontFamily: "'Righteous', cursive",
                fontSize: 13,
                color: getRatingColor(rating),
                background: `${getRatingColor(rating)}18`,
                padding: '2px 10px',
                borderRadius: 12,
                border: `1.5px solid ${getRatingColor(rating)}40`,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                {getRatingLabel(rating)} {rating.toFixed(1)}
              </span>
            </div>
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

        {/* Delete */}
        <button
          onClick={handleDelete}
          style={{
            width: '100%', marginTop: 16, padding: '10px 0',
            background: 'none', border: '1.5px solid var(--text-muted)',
            borderRadius: 'var(--radius)', color: 'var(--text-muted)',
            fontFamily: "'Righteous', cursive", fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Trash2 size={16} /> Delete Dish
        </button>
      </div>
    </div>
  );
}
