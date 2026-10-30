import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, Loader, X, Sparkles, ChevronLeft, ChevronRight, RefreshCw, UtensilsCrossed, PenLine } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RatingSlider } from '../components/RatingSlider';
import { ScrollBar } from '../components/ScrollBar';
import { ScannedDishList } from '../components/ScannedDishList';
import type { ScannedDish } from '../components/ScannedDishCard';
import { analyzeDishImage, analyzeMenuUrl, uploadPhoto, getRestaurantMenu, saveRestaurantMenu } from '../lib/api';
import { resolveMenuUrl } from '../lib/menu';
import { getCached, setCached } from '../lib/cache';
import { usePersistentState, clearPersistentState } from '../hooks/usePersistentState';
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

// The saved dish a new name is the same dish as, if any: the same name up to
// case, punctuation, word order and plurals, or a slip of a letter or two in a
// long name ("Paneer Makkhani" / "Paneer Makhani"). It used to accept either
// name containing the other, which called a scanned "Samosa" a repeat of a
// saved "Samosa Chaat" — fine for a "Saved" tag, wrong once a match offers to
// overwrite that dish's rating.
function findDuplicate(newName: string, existing: Dish[]): Dish | undefined {
  const key = (s: string) => normalizeName(s).split(' ').map((w) => w.replace(/(es|s)$/, '')).sort().join(' ');
  const target = key(newName);
  if (!target) return undefined;
  return existing.find((d) => {
    const other = key(d.name);
    return other === target || (target.length >= 8 && editDistance(other, target) <= 2);
  });
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// What a list row needs to know about the saved dish it repeats.
function existingOf(dish: Dish | undefined): ScannedDish['existing'] {
  return dish && { id: dish.id, name: dish.name, rating: dish.rating, want_to_try: dish.want_to_try };
}

// "Add 3 dishes", "Update 2 dishes", or "Add 3 · update 2".
function saveLabel(list: ScannedDish[]): string {
  const updating = list.filter((d) => d.action === 'update' && d.existing).length;
  const adding = list.filter((d) => d.action !== 'ignore').length - updating;
  const n = (k: number) => `${k} dish${k !== 1 ? 'es' : ''}`;
  if (updating === 0) return `Add ${n(adding)}`;
  if (adding === 0) return `Update ${n(updating)}`;
  return `Add ${adding} · update ${updating}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddDishPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const navigate = useNavigate();
  const { addDish, getDishes, updateDish, restaurants, showToast, startBackgroundImport } = useApp();
  const scanFileRef = useRef<HTMLInputElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const photoTouchStartX = useRef(0);

  const restaurant = restaurants.find((r) => r.id === restaurantId);

  // Tab state. The restaurant page links straight to ?tab=url once a menu
  // has been scanned and cached.
  const [searchParams] = useSearchParams();

  // What you've picked, rated and typed is kept per restaurant across leaving
  // the page or the app. (Photos aren't: they're too big to stash.)
  const draft = `addDish:${restaurantId}:`;

  // Manual entry state
  const [name, setName] = usePersistentState(draft + 'name', '');
  const [dishType, setDishType] = usePersistentState<DishType>(draft + 'dishType', 'entree');
  const [wantToTry, setWantToTry] = usePersistentState(draft + 'wantToTry', false);
  const [rating, setRating] = usePersistentState(draft + 'rating', 7);
  const [notes, setNotes] = usePersistentState(draft + 'notes', '');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoViewIndex, setPhotoViewIndex] = useState(0);
  const [photoFullscreen, setPhotoFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Scan state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState('');
  const [scannedDishes, setScannedDishes] = usePersistentState<ScannedDish[]>(draft + 'scanned', []);
  const [scanPhotos, setScanPhotos] = useState<string[]>([]);

  // Picking from the restaurant's own menu is the fast path, so it leads;
  // typing a dish in by hand is the fallback for when that finds nothing.
  // Declared after the scan list so a scan you came back to opens on its tab.
  const [activeTab, setActiveTab] = useState<'manual' | 'scan' | 'url'>(() => {
    const requested = searchParams.get('tab');
    if (requested === 'manual' || requested === 'scan') return requested;
    return scannedDishes.length > 0 ? 'scan' : 'url';
  });

  // URL state
  const [menuUrl, setMenuUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlDishes, setUrlDishes] = usePersistentState<ScannedDish[]>(draft + 'menu', []);
  const [urlNote, setUrlNote] = useState('');
  // Set when the list on screen came from the saved menu rather than a fresh
  // scan, so we can label it and offer a rescan.
  const [menuScannedAt, setMenuScannedAt] = useState<string | null>(null);
  // The "Update menu" panel above an existing list: its three choices, or the
  // link box once "Use a different link" is picked.
  const [menuAction, setMenuAction] = useState<null | 'choose' | 'link'>(null);

  // ─── Scan handlers ──────────────────────────────────────────────────────────

  // Picking photos only lines them up: each can be removed (✕) and more
  // added before anything is sent, and the scan starts on "Scan". A scan in
  // progress can be cancelled; whatever it was still waiting on is ignored.
  const handleScanCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const read = await Promise.all(files.map((file) => new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve((ev.target?.result as string) ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    })));
    const photos = read.filter((x): x is string => !!x);
    if (photos.length < files.length) showToast(`${files.length - photos.length} photo(s) couldn't be opened`);
    setScanPhotos((prev) => [...prev, ...photos]);
  };

  const removeScanPhoto = (index: number) => setScanPhotos((prev) => prev.filter((_, i) => i !== index));

  // Bumped by every scan and every cancel; a scan whose number is no longer
  // current has been cancelled and drops its results.
  const runRef = useRef(0);

  const cancelScan = () => {
    runRef.current++;
    setAnalyzing(false);
    setAnalyzeStatus('');
  };

  // Several photos at once (a stack of receipts, a menu's pages): each is read
  // on its own, three at a time, and the dishes merged into one list — a dish
  // on two receipts is one row. A photo that can't be read is skipped and
  // counted rather than failing the rest.
  const startScan = async () => {
    const photos = scanPhotos;
    if (photos.length === 0) return;
    const run = ++runRef.current;

    setAnalyzing(true);
    setAnalyzeStatus(photos.length > 1 ? `Reading ${photos.length} photos...` : 'Reading image...');
    setScannedDishes([]);

    try {
      // What's already saved here, and the saved menu, go along with each
      // photo: the model reads "CHK TKA MSL" off a receipt as the "Chicken
      // Tikka Masala" you already have, which no name comparison here could.
      const [existingDishes, savedMenu] = restaurantId
        ? await Promise.all([getDishes(restaurantId), getRestaurantMenu(restaurantId).catch(() => null)])
        : [[] as Dish[], null];
      const known = [...new Set([...existingDishes.map((d) => d.name), ...(savedMenu?.items ?? []).map((i) => i.name)])];

      const readPhoto = async (dataUrl: string) => {
        const result = await analyzeDishImage(await compressImage(dataUrl, 800, 0.70), known);
        return result.dishes ?? [];
      };

      let done = 0;
      let failed = 0;
      const found: Awaited<ReturnType<typeof readPhoto>> = [];
      const queue = [...photos];
      await Promise.all(Array.from({ length: Math.min(3, photos.length) }, async () => {
        for (let photo = queue.shift(); photo && runRef.current === run; photo = queue.shift()) {
          try {
            found.push(...await readPhoto(photo));
          } catch (err) {
            console.error('Scan failed for one photo:', err);
            failed++;
          }
          done++;
          if (photos.length > 1 && runRef.current === run) setAnalyzeStatus(`Reading photos... ${done} of ${photos.length} done`);
        }
      }));

      if (runRef.current !== run) return; // cancelled
      setAnalyzeStatus('Processing results...');

      const seen = new Set<string>();
      const dishes: ScannedDish[] = [];
      for (const d of found) {
        // The model's match first (it can read abbreviations), then the
        // name itself.
        const saved = (d.matches && existingDishes.find((ex) => normalizeName(ex.name) === normalizeName(d.matches!))) ||
          findDuplicate(d.name, existingDishes);
        const key = saved ? `saved:${saved.id}` : normalizeName(d.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        dishes.push({
          name: d.name,
          dish_type: normalizeDishType(saved?.dish_type ?? d.dish_type),
          group: normalizeDishType(saved?.dish_type ?? d.dish_type),
          action: 'ignore' as const,
          rating: saved?.rating ?? 7,
          notes: '',
          duplicate: saved?.name,
          existing: existingOf(saved),
        });
      }

      const skipped = failed > 0 ? ` (${failed} photo${failed > 1 ? 's' : ''} couldn't be read)` : '';
      if (dishes.length > 0) {
        setScannedDishes(dishes);
        const from = photos.length > 1 ? ` in ${photos.length - failed} photos` : '';
        showToast(`Found ${dishes.length} dish${dishes.length > 1 ? 'es' : ''}${from}!${skipped}`);
      } else if (failed === photos.length) {
        showToast(`Analysis failed${photos.length > 1 ? ' for every photo' : ''}. Try again.`);
      } else {
        showToast(`No dishes detected. Try a clearer photo.${skipped}`);
      }
    } catch (err) {
      if (runRef.current !== run) return;
      console.error('Scan failed:', err);
      showToast(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      if (runRef.current === run) {
        setAnalyzing(false);
        setAnalyzeStatus('');
      }
    }
  };

  const updateScannedDish = (index: number, updates: Partial<ScannedDish>) => {
    setScannedDishes((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...updates } : d))
    );
  };

  // Saves the picked rows of either list: rows marked "update" change the dish
  // already saved (its rating, and notes if any were typed); the rest are
  // added as new dishes in the background.
  const saveChosen = async (list: ScannedDish[]) => {
    if (!restaurantId) return;
    const chosen = list.filter((d) => d.action !== 'ignore');
    if (chosen.length === 0) {
      showToast('Select at least one dish to add.');
      return;
    }
    const updates = chosen.filter((d) => d.action === 'update' && d.existing);
    const additions = chosen.filter((d) => !(d.action === 'update' && d.existing));

    if (updates.length > 0) {
      try {
        await Promise.all(updates.map((d) => {
          const changes: Partial<Dish> = { rating: d.rating, want_to_try: false };
          if (d.notes.trim()) changes.notes = d.notes;
          return updateDish(d.existing!.id, changes);
        }));
        // Paint the new ratings straight away on the restaurant page.
        const cached = getCached<Dish[]>(`dishes:${restaurantId}`);
        if (cached) {
          setCached(`dishes:${restaurantId}`, cached.map((dish) => {
            const u = updates.find((d) => d.existing!.id === dish.id);
            return u ? { ...dish, rating: u.rating, want_to_try: false, notes: u.notes.trim() ? u.notes : dish.notes } : dish;
          }));
        }
      } catch (err) {
        showToast(`Couldn't update: ${err instanceof Error ? err.message : 'unknown error'}`);
        return;
      }
    }

    if (additions.length > 0) {
      startBackgroundImport(additions.map((dish) => ({
        restaurant_id: restaurantId,
        name: dish.name,
        dish_type: normalizeDishType(dish.dish_type),
        want_to_try: dish.action === 'want_to_try',
        rating: dish.action === 'rate' ? dish.rating : null,
        notes: dish.notes,
        photos: [],
      })), restaurant?.name || 'Restaurant');
    } else {
      showToast(`Updated ${updates.length} dish${updates.length !== 1 ? 'es' : ''}`);
    }
    clearPersistentState(draft);
    navigate(`/restaurant/${restaurantId}`, { replace: true });
  };

  const handleSaveScanned = () => saveChosen(scannedDishes);

  // ─── URL handlers ───────────────────────────────────────────────────────────

  const toScannedDishes = useCallback(
    (items: { name: string; dish_type: string }[], existing: Dish[]): ScannedDish[] =>
      items.map((d) => ({
        name: d.name,
        dish_type: normalizeDishType(d.dish_type),
        group: normalizeDishType(d.dish_type),
        action: 'ignore' as const,
        rating: 7,
        notes: '',
        duplicate: findDuplicate(d.name, existing)?.name,
        existing: existingOf(findDuplicate(d.name, existing)),
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
        // Keep a list you were partway through picking from.
        setUrlDishes((prev) => (prev.length > 0 ? prev : toScannedDishes(menu.items, existingDishes)));
        setUrlNote('');
        setMenuScannedAt(menu.scanned_at);
      },
    );
    return () => { cancelled = true; };
  }, [restaurantId, getDishes, toScannedDishes, setUrlDishes]);

  // Nothing saved yet — offer the restaurant's own menu link as the default,
  // falling back to its website when no usable menu URL is on file.
  useEffect(() => {
    if (menuUrl) return;
    const fallback = resolveMenuUrl(restaurant);
    if (fallback) setMenuUrl(fallback);
  }, [restaurant, menuUrl]);

  // `fresh: true` is "Start over": the list is replaced by whatever this scan
  // finds. Otherwise new dishes are added to the list already on screen.
  const handleAnalyzeUrl = async ({ fresh: startOver = false }: { fresh?: boolean } = {}) => {
    if (!menuUrl.trim() || !restaurantId) return;
    const trimmedUrl = menuUrl.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      setUrlNote('Please enter a valid URL starting with http:// or https://');
      return;
    }
    setUrlLoading(true);
    setUrlNote('');
    setMenuScannedAt(null);
   
    try {
      // Fetch existing dishes and analyze URL in parallel
      const [result, existingDishes] = await Promise.all([
        analyzeMenuUrl(trimmedUrl),
        getDishes(restaurantId),
      ]);
      const found = (result.dishes || []).map((d) => ({ name: d.name, dish_type: d.dish_type }));
      // A new link adds to the list rather than replacing it: a menu is often
      // split across pages (lunch, dinner, drinks), and a second link that
      // finds less shouldn't throw away what the first one found. Your picks
      // on dishes already listed are kept.
      const base = startOver ? [] : urlDishes;
      const known = new Set(base.map((d) => normalizeName(d.name)));
      const fresh = found.filter((d) => !known.has(normalizeName(d.name)));
      const merged = [...base, ...toScannedDishes(fresh, existingDishes)];
      setUrlDishes(merged);
      setMenuAction(null);
      if (base.length > 0) {
        setUrlNote('');
        showToast(fresh.length > 0
          ? `Added ${fresh.length} more dish${fresh.length !== 1 ? 'es' : ''}`
          : result.note || 'No new dishes on that page');
      } else {
        setUrlNote(result.note || '');
      }
      // Save the menu so this restaurant never has to be scanned again.
      if (fresh.length > 0) {
        const items = merged.map((d) => ({ name: d.name, dish_type: d.group ?? d.dish_type }));
        saveRestaurantMenu(restaurantId, trimmedUrl, items, '').catch(() => {});
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

  const selectedUrlCount = urlDishes.filter((d) => d.action !== 'ignore').length;
  const duplicateUrlCount = urlDishes.filter((d) => d.duplicate).length;

  const handleSaveUrl = () => saveChosen(urlDishes);

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
      clearPersistentState(draft);
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
            multiple
            onChange={handleScanCapture}
            style={{ display: 'none' }}
          />

          {scannedDishes.length === 0 && !analyzing && scanPhotos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14 }}>
                Take a photo of a menu, receipt, or dish to auto-detect items — or pick several at once
              </p>
              <button
                className="camera-btn"
                style={{ width: '100%', maxWidth: 300, margin: '0 auto', padding: '16px 24px', fontSize: 16 }}
                onClick={() => scanFileRef.current?.click()}
              >
                <Camera size={22} />
                Take Photo / Choose Photos
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
              <button className="btn btn-secondary" style={{ marginTop: 18, padding: '10px 28px' }} onClick={cancelScan}>
                Cancel
              </button>
            </div>
          )}

          {/* The photos: lined up (removable, more can be added) until the
              scan starts, then a strip above the results. */}
          {scanPhotos.length > 0 && (
            <div className="scan-photos">
              {scanPhotos.map((src, i) => (
                <div key={i} className="scan-photo">
                  <img src={src} alt={`Photo ${i + 1}`} />
                  {!analyzing && scannedDishes.length === 0 && (
                    <button aria-label={`Remove photo ${i + 1}`} onClick={() => removeScanPhoto(i)}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {scanPhotos.length > 0 && !analyzing && scannedDishes.length === 0 && (
            <>
              <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 10 }} onClick={() => scanFileRef.current?.click()}>
                + Add more photos
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setScanPhotos([])}>
                  Cancel
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={startScan}>
                  <Sparkles size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
                  {`Scan ${scanPhotos.length} photo${scanPhotos.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
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

              {/* A scanned photo is usually a receipt — you've already eaten these */}
              <ScannedDishList dishes={scannedDishes} onUpdate={updateScannedDish} defaultAction="rate" />

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setScannedDishes([]);
                    setScanPhotos([]);
                  }}
                >
                  Start over
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  onClick={handleSaveScanned}
                  disabled={scannedDishes.every((d) => d.action === 'ignore')}
                >
                  {saveLabel(scannedDishes)}
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
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                boxShadow: '0 4px 18px var(--shadow)',
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
                  onClick={() => handleAnalyzeUrl()}
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
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 12 }}>Reading the menu…</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                Checks the restaurant's site and menu listings online — can take up to a minute.
              </p>
            </div>
          )}

          {urlDishes.length > 0 && !urlLoading && (
            <>
              {urlNote && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12, textAlign: 'center' }}>{urlNote}</p>
              )}
              {/* One header line does the work of the old status bar and title */}
              <div className="menu-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="menu-head-title">{urlDishes.length} dishes</h2>
                  <p className="menu-head-sub">
                    {selectedUrlCount > 0
                      ? `${selectedUrlCount} selected`
                      : 'Tap a dish to add it'}
                    {duplicateUrlCount > 0 && ` · ${duplicateUrlCount} already saved`}
                    {menuScannedAt && ` · scanned ${new Date(menuScannedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                <button className="menu-rescan" onClick={() => setMenuAction((a) => (a ? null : 'choose'))}>
                  <RefreshCw size={12} /> {menuAction ? 'Close' : 'Update menu'}
                </button>
              </div>

              {/* Every way to change the list, in one place */}
              {menuAction === 'choose' && (
                <div className="menu-actions">
                  <button onClick={() => handleAnalyzeUrl()} disabled={!menuUrl.trim()}>
                    <strong>Scan again</strong>
                    <span>Re-read the menu and add anything that's missing</span>
                  </button>
                  <button onClick={() => setMenuAction('link')}>
                    <strong>Use a different link</strong>
                    <span>Paste the menu page or a PDF — new dishes are added</span>
                  </button>
                  <button onClick={() => handleAnalyzeUrl({ fresh: true })} disabled={!menuUrl.trim()}>
                    <strong>Start over</strong>
                    <span>Throw this list away and scan from scratch</span>
                  </button>
                </div>
              )}

              {/* Missing dishes? Point it at another page of the menu; whatever
                  it finds is added below. */}
              {menuAction === 'link' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      type="url"
                      placeholder="https://restaurant.com/menu"
                      value={menuUrl}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setMenuUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && menuUrl.trim()) handleAnalyzeUrl(); }}
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ padding: '12px 18px', whiteSpace: 'nowrap' }}
                      disabled={urlLoading || !menuUrl.trim()}
                      onClick={() => handleAnalyzeUrl()}
                    >
                      Import
                    </button>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '6px 0 0' }}>
                    New dishes are added to this list. Paste the menu page itself, or a PDF.
                  </p>
                </div>
              )}

              <ScannedDishList dishes={urlDishes} onUpdate={updateUrlDish} />

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={urlDishes.every((d) => d.action === 'ignore')}
                  onClick={handleSaveUrl}
                >
                  {saveLabel(urlDishes)}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
