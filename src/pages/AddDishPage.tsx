import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Loader, X, Sparkles, ChevronLeft, ChevronRight, RefreshCw, UtensilsCrossed, PenLine } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RatingSlider } from '../components/RatingSlider';
import { ScrollBar } from '../components/ScrollBar';
import { ScannedDishCard } from '../components/ScannedDishCard';
import type { ScannedDish } from '../components/ScannedDishCard';
import { analyzeDishImage, analyzeMenuUrl, uploadPhoto, getRestaurantMenu, saveRestaurantMenu } from '../lib/api';
import { resolveMenuUrl } from '../lib/menu';
import { DISH_TYPES, getRatingLabel, getRatingColor, normalizeDishType } from '../types';
import type { Dish, DishType } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Compress an image dataURL to max dimensions and JPEG quality before sending to API
function compressImage(dataUrl: string, maxPx = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      // Return only the base64 portion (strip "data:image/jpeg;base64,")
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.src = dataUrl;
  });
}

// Normalize a dish name for fuzzy comparison
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Check if a new dish name is similar to an existing dish — returns the existing name if matched
function findDuplicate(newName: string, existing: Dish[]): string | undefined {
  const norm = normalizeName(newName);
  for (const d of existing) {
    const existingNorm = normalizeName(d.name);
    if (
      existingNorm === norm ||
      existingNorm.includes(norm) ||
      norm.includes(existingNorm)
    ) {
      return d.name;
    }
  }
  return undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddDishPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const navigate = useNavigate();
  const { addDish, getDishes, restaurants, showToast, startBackgroundImport } = useApp();
  const scanFileRef = useRef<HTMLInputElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const photoTouchStartX = useRef(0);

  const restaurant = restaurants.find((r) => r.id === restaurantId);

  // Tab state. The restaurant page links straight to ?tab=url once a menu
  // has been scanned and cached.
  const [searchParams] = useSearchParams();
  // Picking from the restaurant's own menu is the fast path, so it leads;
  // typing a dish in by hand is the fallback for when that finds nothing.
  const [activeTab, setActiveTab] = useState<'manual' | 'scan' | 'url'>(() => {
    const requested = searchParams.get('tab');
    return requested === 'manual' || requested === 'scan' ? requested : 'url';
  });

  // Manual entry state
  const [name, setName] = useState('');
  const [dishType, setDishType] = useState<DishType>('entree');
  const [wantToTry, setWantToTry] = useState(false);
  const [rating, setRating] = useState(7);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoViewIndex, setPhotoViewIndex] = useState(0);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Scan state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState('');
  const [scannedDishes, setScannedDishes] = useState<ScannedDish[]>([]);
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);

  // URL state
  const [menuUrl, setMenuUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlDishes, setUrlDishes] = useState<ScannedDish[]>([]);
  const [urlNote, setUrlNote] = useState('');
  // Set when the list on screen came from the saved menu rather than a fresh
  // scan, so we can label it and offer a rescan.
  const [menuScannedAt, setMenuScannedAt] = useState<string | null>(null);
  const [urlTypeFilter, setUrlTypeFilter] = useState<DishType | 'all'>('all');

  // ─── Scan handlers ──────────────────────────────────────────────────────────

  const handleScanCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    setAnalyzeStatus('Reading image...');
    setScannedDishes([]);

    try {
      // Read file as data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setScanPhoto(ev.target.result as string);
            resolve(ev.target.result as string);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      setAnalyzeStatus('Compressing image...');
      const compressedBase64 = await compressImage(dataUrl, 800, 0.70);

      setAnalyzeStatus('Analyzing with AI...');

      // Fetch existing dishes and run analysis in parallel to save time
      const [result, existingDishes] = await Promise.all([
        analyzeDishImage(compressedBase64),
        restaurantId ? getDishes(restaurantId) : Promise.resolve([]),
      ]);

      setAnalyzeStatus('Processing results...');

      if (result.dishes?.length > 0) {
        setScannedDishes(
          result.dishes.map((d: { name: string; dish_type: string }) => ({
            name: d.name,
            dish_type: normalizeDishType(d.dish_type),
            action: 'ignore' as const,
            rating: 7,
            notes: '',
            duplicate: findDuplicate(d.name, existingDishes),
          }))
        );
        showToast(`Found ${result.dishes.length} dish${result.dishes.length > 1 ? 'es' : ''}!`);
      } else {
        showToast('No dishes detected. Try a clearer photo.');
      }
    } catch (err) {
      console.error('Scan failed:', err);
      showToast(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAnalyzing(false);
      setAnalyzeStatus('');
    }

    e.target.value = '';
  };

  const updateScannedDish = (index: number, updates: Partial<ScannedDish>) => {
    setScannedDishes((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...updates } : d))
    );
  };

  const handleSaveScanned = () => {
    if (!restaurantId) return;
    const toSave = scannedDishes.filter((d) => d.action !== 'ignore');
    if (toSave.length === 0) {
      showToast('Select at least one dish to add.');
      return;
    }
    const items: Partial<Dish>[] = toSave.map((dish) => ({
      restaurant_id: restaurantId,
      name: dish.name,
      dish_type: normalizeDishType(dish.dish_type),
      want_to_try: dish.action === 'want_to_try',
      rating: dish.action === 'want_to_try' ? null : dish.rating,
      notes: dish.notes,
      photos: [],
    }));
    startBackgroundImport(items, restaurant?.name || 'Restaurant');
    navigate(`/restaurant/${restaurantId}`, { replace: true });
  };

  // ─── URL handlers ───────────────────────────────────────────────────────────

  const toScannedDishes = useCallback(
    (items: { name: string; dish_type: string }[], existing: Dish[]): ScannedDish[] =>
      items.map((d) => ({
        name: d.name,
        dish_type: normalizeDishType(d.dish_type),
        action: 'ignore' as const,
        rating: 7,
        notes: '',
        duplicate: findDuplicate(d.name, existing),
      })),
    [],
  );

  // Load the saved menu on open: if this restaurant has already been scanned
  // (the restaurant page prefetches on first visit), show the dish list right
  // away instead of making the user find a URL and wait on the API again.
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    Promise.all([getRestaurantMenu(restaurantId), getDishes(restaurantId)]).then(
      ([menu, existingDishes]) => {
        if (cancelled || !menu || menu.items.length === 0) return;
        setMenuUrl(menu.source_url || '');
        setUrlDishes(toScannedDishes(menu.items, existingDishes));
        setUrlNote('');
        setMenuScannedAt(menu.scanned_at);
      },
    );
    return () => { cancelled = true; };
  }, [restaurantId, getDishes, toScannedDishes]);

  // Nothing saved yet — offer the restaurant's own menu link as the default,
  // falling back to its website when no usable menu URL is on file.
  useEffect(() => {
    if (menuUrl) return;
    const fallback = resolveMenuUrl(restaurant);
    if (fallback) setMenuUrl(fallback);
  }, [restaurant, menuUrl]);

  const handleAnalyzeUrl = async () => {
    if (!menuUrl.trim() || !restaurantId) return;
    const trimmedUrl = menuUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      setUrlNote('Please enter a valid URL starting with http:// or https://');
      return;
    }
    setUrlLoading(true);
    setUrlNote('');
    setMenuScannedAt(null);
    setUrlTypeFilter('all');
    try {
      // Fetch existing dishes and analyze URL in parallel
      const [result, existingDishes] = await Promise.all([
        analyzeMenuUrl(trimmedUrl),
        getDishes(restaurantId),
      ]);
      const items = (result.dishes || []).map((d) => ({ name: d.name, dish_type: d.dish_type }));
      setUrlDishes(toScannedDishes(items, existingDishes));
      setUrlNote(result.note || '');
      // Save the menu so this restaurant never has to be scanned again.
      if (items.length > 0) {
        saveRestaurantMenu(restaurantId, trimmedUrl, items, result.note || '').catch(() => {});
      }
    } catch (err) {
      setUrlNote(err instanceof Error ? err.message : 'Failed to analyze menu');
    } finally {
      setUrlLoading(false);
    }
  };

  const updateUrlDish = (index: number, updates: Partial<ScannedDish>) => {
    setUrlDishes((prev) => prev.map((d, i) => (i === index ? { ...d, ...updates } : d)));
  };

  const handleSaveUrl = () => {
    if (!restaurantId) return;
    const toSave = urlDishes.filter((d) => d.action !== 'ignore');
    if (toSave.length === 0) {
      showToast('Select at least one dish to add.');
      return;
    }
    const items: Partial<Dish>[] = toSave.map((dish) => ({
      restaurant_id: restaurantId,
      name: dish.name,
      dish_type: normalizeDishType(dish.dish_type),
      want_to_try: dish.action === 'want_to_try',
      rating: dish.action === 'rate' ? dish.rating : null,
      notes: dish.notes,
    }));
    startBackgroundImport(items, restaurant?.name || 'Restaurant');
    navigate(`/restaurant/${restaurantId}`, { replace: true });
  };

  // ─── Manual entry handler ────────────────────────────────────────────────────

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSaveManual = async () => {
    if (!name.trim() || !restaurantId) return;
    setSaving(true);
    try {
      const uploadedPhotos: string[] = [];
      for (const photo of photos) {
        if (photo.startsWith('data:')) {
          try {
            const blob = await fetch(photo).then((r) => r.blob());
            const file = new File([blob], `dish-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, { type: 'image/jpeg' });
            const url = await uploadPhoto(file, 'dish-photos', `${restaurantId}/${file.name}`);
            uploadedPhotos.push(url);
          } catch {
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
      showToast('Dish added!');
      navigate(`/restaurant/${restaurantId}`, { replace: true });
    } catch (err) {
      console.error('Failed to add dish', err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Hidden photo input */}
      <input
        ref={photoFileRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoCapture}
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
        <h1 style={{ flex: 1 }}>Add Dish</h1>
        {activeTab === 'manual' && (
          <button
            onClick={() => photoFileRef.current?.click()}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
          >
            <Camera size={20} />
          </button>
        )}
      </div>

      {/* Photo hero */}
      {activeTab === 'manual' && photos.length > 0 ? (
        <div
          style={{ position: 'relative', height: 180, background: 'var(--bg-secondary)', overflow: 'hidden' }}
          onTouchStart={(e) => { photoTouchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - photoTouchStartX.current;
            if (Math.abs(dx) > 50) {
              if (dx < 0 && photoViewIndex < photos.length - 1) setPhotoViewIndex((p) => p + 1);
              if (dx > 0 && photoViewIndex > 0) setPhotoViewIndex((p) => p - 1);
            }
          }}
        >
          <img
            src={photos[photoViewIndex]}
            alt="Dish photo"
            onClick={() => setPhotoFullscreen(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
          />
          {restaurant && (
            <div style={{
              position: 'absolute', top: 10, left: 12,
              background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: '3px 10px',
            }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>at </span>
              <strong style={{ fontSize: 12, color: 'white' }}>{restaurant.name}</strong>
            </div>
          )}
          <button
            onClick={() => {
              setPhotos((prev) => prev.filter((_, j) => j !== photoViewIndex));
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
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
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
            </div>
          )}
        </div>
      ) : restaurant ? (
        <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
          at <strong style={{ color: 'var(--text-primary)' }}>{restaurant.name}</strong>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="provider-toggle" style={{ margin: '0 20px 4px' }}>
        <button
          className={activeTab === 'url' ? 'active' : ''}
          onClick={() => setActiveTab('url')}
          style={{ flex: 1 }}
        >
          <UtensilsCrossed size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Menu
        </button>
        <button
          className={activeTab === 'scan' ? 'active' : ''}
          onClick={() => setActiveTab('scan')}
          style={{ flex: 1 }}
        >
          <Camera size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Scan
        </button>
        <button
          className={activeTab === 'manual' ? 'active' : ''}
          onClick={() => setActiveTab('manual')}
          style={{ flex: 1 }}
        >
          <PenLine size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Manual
        </button>
      </div>

      {/* ── Manual Entry Tab ── */}
      {activeTab === 'manual' && (
        <div style={{ padding: '16px 20px 100px' }}>
          <div className="form-group">
            <label>Dish Name *</label>
            <input
              className="input"
              placeholder="What did you have?"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

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

          <div className="form-group">
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: wantToTry ? 'linear-gradient(135deg, var(--neon-pink), var(--cyan))' : 'var(--bg-secondary)',
                borderRadius: 'var(--radius)', border: `2px solid ${wantToTry ? 'var(--cyan)' : 'var(--border)'}`,
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

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={handleSaveManual}
            disabled={!name.trim() || saving}
          >
            {saving ? <><Loader size={16} className="spin" /> Saving...</> : 'Add Dish'}
          </button>
        </div>
      )}

      {/* ── Scan Tab ── */}
      {activeTab === 'scan' && (
        <div style={{ padding: '16px 20px 100px' }}>
          <input
            ref={scanFileRef}
            type="file"
            accept="image/*"
            onChange={handleScanCapture}
            style={{ display: 'none' }}
          />

          {scannedDishes.length === 0 && !analyzing && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
                Take a photo of a menu, receipt, or dish to auto-detect items
              </p>
              <button
                className="camera-btn"
                style={{ width: '100%', maxWidth: 300, margin: '0 auto', padding: '16px 24px', fontSize: 16 }}
                onClick={() => scanFileRef.current?.click()}
              >
                <Camera size={22} />
                Take Photo / Gallery / Files
              </button>
            </div>
          )}

          {analyzing && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Loader size={36} className="spin" style={{ color: 'var(--hot-pink)', marginBottom: 16, display: 'inline-block' }} />
              <p style={{ color: 'var(--text-secondary)', fontFamily: "'Righteous', cursive", fontSize: 16, marginBottom: 8 }}>
                Analyzing with AI...
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {analyzeStatus || 'Please wait...'}
              </p>
            </div>
          )}

          {scanPhoto && (
            <div className="form-group">
              <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 12 }}>
                <img src={scanPhoto} alt="Scan" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              </div>
            </div>
          )}

          {scannedDishes.length > 0 && !analyzing && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Sparkles size={16} style={{ color: 'var(--hot-pink)' }} />
                <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)' }}>
                  Detected Dishes ({scannedDishes.length})
                </h3>
                {scannedDishes.some((d) => d.duplicate) && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                    · {scannedDishes.filter((d) => d.duplicate).length} possible duplicate{scannedDishes.filter((d) => d.duplicate).length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Tap an action for each dish you want to add.
              </p>

              {scannedDishes.map((dish, i) => (
                <ScannedDishCard
                  key={i}
                  dish={dish}
                  onUpdate={(updates) => updateScannedDish(i, updates)}
                />
              ))}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setScannedDishes([]);
                    setScanPhoto(null);
                    setTimeout(() => scanFileRef.current?.click(), 100);
                  }}
                >
                  Rescan
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  onClick={handleSaveScanned}
                  disabled={scannedDishes.every((d) => d.action === 'ignore')}
                >
                  {`Add ${scannedDishes.filter((d) => d.action !== 'ignore').length} Dish${scannedDishes.filter((d) => d.action !== 'ignore').length !== 1 ? 'es' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── URL Tab ── */}
      {activeTab === 'url' && (
        <div style={{ padding: '16px 20px 100px' }}>
          {urlDishes.length === 0 && !urlLoading && (
            <div style={{ textAlign: 'center', paddingTop: 12 }}>
              <div style={{
                width: 64, height: 64, margin: '0 auto 14px',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, var(--hot-pink), var(--purple))',
                boxShadow: '0 0 22px rgba(255, 20, 147, 0.28)',
              }}>
                <UtensilsCrossed size={28} color="var(--white)" />
              </div>
              <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 17, margin: '0 0 6px' }}>
                {menuUrl ? 'Pull up the menu' : 'Where’s the menu?'}
              </h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 18, fontSize: 13, lineHeight: 1.45 }}>
                {menuUrl
                  ? `We’ll read ${restaurant?.name ?? 'this restaurant'}’s menu and list every dish — just tick the ones you had.`
                  : 'Paste a link to the menu and we’ll pull the dishes out of it.'}
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  className="input"
                  type="url"
                  placeholder="https://restaurant.com/menu"
                  value={menuUrl}
                  onChange={(e) => setMenuUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && menuUrl.trim()) handleAnalyzeUrl(); }}
                  style={{ flex: 1, fontSize: 13 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '12px 22px', whiteSpace: 'nowrap' }}
                  disabled={urlLoading || !menuUrl.trim()}
                  onClick={handleAnalyzeUrl}
                >
                  {urlLoading ? <Loader size={18} className="spin" /> : 'Import'}
                </button>
              </div>
              {urlNote && (
                <p style={{
                  color: 'var(--coral)', fontSize: 13, lineHeight: 1.45,
                  background: 'rgba(255,100,60,0.08)', border: '1px solid rgba(255,100,60,0.2)',
                  borderRadius: 'var(--radius)', padding: '10px 12px', margin: '0 0 12px',
                }}>
                  {urlNote}
                </p>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 18 }}>
                Works with online menus, PDFs, and photos of menus
              </p>

              {/* The other two ways in, for when there's no menu to read */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1, fontSize: 13 }} onClick={() => setActiveTab('scan')}>
                  <Camera size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Scan a menu
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, fontSize: 13 }} onClick={() => setActiveTab('manual')}>
                  <PenLine size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Add by hand
                </button>
              </div>
            </div>
          )}

          {urlLoading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="loading-spinner" />
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 12 }}>Analyzing menu...</p>
            </div>
          )}

          {urlDishes.length > 0 && !urlLoading && (
            <>
              {urlNote && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12, textAlign: 'center' }}>{urlNote}</p>
              )}
              {menuScannedAt && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: 12, padding: '8px 12px',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--palm-green)' }}>
                    Saved menu · scanned {new Date(menuScannedAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={handleAnalyzeUrl}
                    disabled={urlLoading || !menuUrl.trim()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'none', border: 'none',
                      color: 'var(--electric-blue)', fontSize: 12, padding: 0,
                    }}
                  >
                    <RefreshCw size={12} /> Rescan
                  </button>
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, margin: '0 0 2px' }}>
                  {urlDishes.length} dishes on the menu
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  Tap Rate or Want to Try on the ones you want
                  {urlDishes.some((d) => d.duplicate) && (
                    <>
                      {' · '}
                      {urlDishes.filter((d) => d.duplicate).length === 1
                        ? '1 looks like a duplicate'
                        : `${urlDishes.filter((d) => d.duplicate).length} look like duplicates`}
                    </>
                  )}
                </p>
              </div>

              {/* Filter the list by the type the analyzer assigned */}
              <ScrollBar className="filter-bar" style={{ marginBottom: 12 }}>
                <button
                  className={`dish-type-pill ${urlTypeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setUrlTypeFilter('all')}
                  style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: 12 }}
                >
                  All {urlDishes.length}
                </button>
                {DISH_TYPES.filter((t) => urlDishes.some((d) => d.dish_type === t.value)).map((type) => (
                  <button
                    key={type.value}
                    className={`dish-type-pill ${urlTypeFilter === type.value ? 'active' : ''}`}
                    onClick={() => setUrlTypeFilter(type.value)}
                    style={{ whiteSpace: 'nowrap', flexShrink: 0, fontSize: 12 }}
                  >
                    {type.label} {urlDishes.filter((d) => d.dish_type === type.value).length}
                  </button>
                ))}
              </ScrollBar>

              {urlDishes
                .map((dish, i) => ({ dish, i }))
                .filter(({ dish }) => urlTypeFilter === 'all' || dish.dish_type === urlTypeFilter)
                .map(({ dish, i }) => (
                  <ScannedDishCard
                    key={i}
                    dish={dish}
                    onUpdate={(updates) => updateUrlDish(i, updates)}
                  />
                ))}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => { setUrlDishes([]); setMenuUrl(''); setUrlNote(''); setMenuScannedAt(null); setUrlTypeFilter('all'); }}
                >
                  Clear
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={urlDishes.every((d) => d.action === 'ignore')}
                  onClick={handleSaveUrl}
                >
                  {`Add ${urlDishes.filter((d) => d.action !== 'ignore').length} Dish${urlDishes.filter((d) => d.action !== 'ignore').length !== 1 ? 'es' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
