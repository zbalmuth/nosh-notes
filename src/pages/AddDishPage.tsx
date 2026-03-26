import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Loader, X, Check, Sparkles, Link } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RatingSlider } from '../components/RatingSlider';
import { analyzeDishImage, analyzeMenuUrl } from '../lib/api';
import { DISH_TYPES } from '../types';
import type { DishType } from '../types';

interface ScannedDish {
  name: string;
  dish_type: string;
  action: 'rate' | 'want_to_try' | 'ignore';
  rating: number;
}

export function AddDishPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const navigate = useNavigate();
  const { addDish, restaurants, showToast } = useApp();
  const scanFileRef = useRef<HTMLInputElement>(null);

  const restaurant = restaurants.find((r) => r.id === restaurantId);

  // Tab state
  const [activeTab, setActiveTab] = useState<'manual' | 'scan' | 'url'>('manual');

  // Manual entry state
  const [name, setName] = useState('');
  const [dishType, setDishType] = useState<DishType>('entree');
  const [wantToTry, setWantToTry] = useState(false);
  const [rating, setRating] = useState(7);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Scan state
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState('');
  const [scannedDishes, setScannedDishes] = useState<ScannedDish[]>([]);
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);
  const [savingScanned, setSavingScanned] = useState(false);

  // URL state
  const [menuUrl, setMenuUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlDishes, setUrlDishes] = useState<ScannedDish[]>([]);
  const [urlNote, setUrlNote] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  // Scan photo and analyze with AI
  const handleScanCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    setAnalyzeStatus('Reading image...');
    setScannedDishes([]);

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setScanPhoto(ev.target.result as string);
            resolve((ev.target.result as string).split(',')[1]);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      setAnalyzeStatus('Sending to AI for analysis...');

      const result = await analyzeDishImage(base64);

      setAnalyzeStatus('Processing results...');

      if (result.dishes?.length > 0) {
        setScannedDishes(
          result.dishes.map((d: { name: string; dish_type: string }) => ({
            name: d.name,
            dish_type: d.dish_type || 'entree',
            action: 'ignore' as const,
            rating: 7,
          }))
        );
        showToast(`Found ${result.dishes.length} dish${result.dishes.length > 1 ? 'es' : ''}!`);
      } else {
        showToast('No dishes detected. Try a clearer photo.');
      }
    } catch (err) {
      console.error('Scan failed:', err);
      showToast(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}. Check console.`);
    } finally {
      setAnalyzing(false);
      setAnalyzeStatus('');
    }

    // Reset file input so same file can be re-selected
    e.target.value = '';
  };

  const updateScannedDish = (index: number, updates: Partial<ScannedDish>) => {
    setScannedDishes((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...updates } : d))
    );
  };

  const handleSaveManual = async () => {
    if (!name.trim() || !restaurantId) return;
    setSaving(true);
    try {
      await addDish({
        restaurant_id: restaurantId,
        name: name.trim(),
        dish_type: dishType,
        want_to_try: wantToTry,
        rating: wantToTry ? null : rating,
        notes,
        photos: [],
      });
      showToast('Dish added!');
      navigate(`/restaurant/${restaurantId}`);
    } catch (err) {
      console.error('Failed to add dish', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveScanned = async () => {
    if (!restaurantId) return;
    const toSave = scannedDishes.filter((d) => d.action !== 'ignore');
    if (toSave.length === 0) {
      showToast('Select at least one dish to add.');
      return;
    }

    setSavingScanned(true);
    try {
      for (const dish of toSave) {
        await addDish({
          restaurant_id: restaurantId,
          name: dish.name,
          dish_type: dish.dish_type as DishType,
          want_to_try: dish.action === 'want_to_try',
          rating: dish.action === 'want_to_try' ? null : dish.rating,
          notes: '',
          photos: [],
        });
      }
      showToast(`${toSave.length} dish${toSave.length > 1 ? 'es' : ''} added!`);
      navigate(`/restaurant/${restaurantId}`);
    } catch (err) {
      console.error('Failed to save scanned dishes', err);
    } finally {
      setSavingScanned(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
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

      {/* Tabs */}
      <div className="provider-toggle" style={{ margin: '0 20px 4px' }}>
        <button
          className={activeTab === 'manual' ? 'active' : ''}
          onClick={() => setActiveTab('manual')}
          style={{ flex: 1 }}
        >
          Manual Entry
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
          className={activeTab === 'url' ? 'active' : ''}
          onClick={() => setActiveTab('url')}
          style={{ flex: 1 }}
        >
          <Link size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          URL
        </button>
      </div>

      {/* Manual Entry Tab */}
      {activeTab === 'manual' && (
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
                borderRadius: 'var(--radius)', border: `2px solid ${wantToTry ? 'var(--cyan)' : 'var(--border)'}`,
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

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={handleSaveManual}
            disabled={!name.trim() || saving}
          >
            {saving ? 'Saving...' : 'Add Dish'}
          </button>
        </div>
      )}

      {/* Scan Tab */}
      {activeTab === 'scan' && (
        <div style={{ padding: '16px 20px 100px' }}>
          {/* Hidden file input for scan */}
          <input
            ref={scanFileRef}
            type="file"
            accept="image/*"
            onChange={handleScanCapture}
            style={{ display: 'none' }}
          />

          {/* No scan yet — show capture button */}
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

          {/* Analyzing spinner */}
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

          {/* Scan preview */}
          {scanPhoto && !analyzing && (
            <div className="form-group">
              <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 12 }}>
                <img src={scanPhoto} alt="Scan" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              </div>
            </div>
          )}

          {/* Scanned dishes list */}
          {scannedDishes.length > 0 && !analyzing && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Sparkles size={16} style={{ color: 'var(--hot-pink)' }} />
                <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)' }}>
                  Detected Dishes ({scannedDishes.length})
                </h3>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                Tap an action for each dish: rate it, mark as want to try, or ignore.
              </p>

              {scannedDishes.map((dish, i) => (
                <div
                  key={i}
                  className="card"
                  style={{
                    padding: 14, marginBottom: 10,
                    border: dish.action !== 'ignore' ? '2px solid var(--hot-pink)' : '2px solid var(--border)',
                    opacity: dish.action === 'ignore' ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Dish name — editable */}
                  <input
                    className="input"
                    value={dish.name}
                    onChange={(e) => updateScannedDish(i, { name: e.target.value })}
                    style={{ fontFamily: "'Righteous', cursive", fontSize: 15, marginBottom: 8, padding: '6px 10px' }}
                  />

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: dish.action === 'rate' ? 10 : 0 }}>
                    <button
                      className={`chip ${dish.action === 'rate' ? 'active' : ''}`}
                      onClick={() => updateScannedDish(i, { action: dish.action === 'rate' ? 'ignore' : 'rate' })}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <Check size={12} />
                      Rate
                    </button>
                    <button
                      className={`chip ${dish.action === 'want_to_try' ? 'active' : ''}`}
                      onClick={() => updateScannedDish(i, { action: dish.action === 'want_to_try' ? 'ignore' : 'want_to_try' })}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <Sparkles size={12} />
                      Want to Try
                    </button>
                    <button
                      className={`chip ${dish.action === 'ignore' ? '' : ''}`}
                      onClick={() => updateScannedDish(i, { action: 'ignore' })}
                      style={{ flex: 1, justifyContent: 'center', opacity: dish.action === 'ignore' ? 1 : 0.5 }}
                    >
                      <X size={12} />
                      Skip
                    </button>
                  </div>

                  {/* Rating slider if action is 'rate' */}
                  {dish.action === 'rate' && (
                    <RatingSlider
                      value={dish.rating}
                      onChange={(val) => updateScannedDish(i, { rating: val })}
                    />
                  )}
                </div>
              ))}

              {/* Save / Rescan buttons */}
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
                  disabled={savingScanned || scannedDishes.every((d) => d.action === 'ignore')}
                >
                  {savingScanned
                    ? 'Saving...'
                    : `Add ${scannedDishes.filter((d) => d.action !== 'ignore').length} Dish${scannedDishes.filter((d) => d.action !== 'ignore').length !== 1 ? 'es' : ''}`}
                </button>
              </div>

            </>
          )}
        </div>
      )}

      {/* URL Tab */}
      {activeTab === 'url' && (
        <div style={{ padding: '16px 20px 100px' }}>
          {urlDishes.length === 0 && !urlLoading && (
            <div>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 14, textAlign: 'center' }}>
                Paste a menu URL and we'll extract the dishes for you
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  className="input"
                  type="url"
                  placeholder="https://restaurant.com/menu"
                  value={menuUrl}
                  onChange={(e) => setMenuUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && menuUrl.trim()) {
                      setUrlLoading(true);
                      setUrlNote('');
                      analyzeMenuUrl(menuUrl.trim())
                        .then((result) => {
                          const dishes = (result.dishes || []).map((d: { name: string; dish_type: string }) => ({
                            name: d.name,
                            dish_type: d.dish_type,
                            action: 'want_to_try' as const,
                            rating: 7,
                          }));
                          setUrlDishes(dishes);
                          setUrlNote(result.note || '');
                        })
                        .catch((err) => setUrlNote(err.message || 'Failed to analyze menu'))
                        .finally(() => setUrlLoading(false));
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '12px 20px', whiteSpace: 'nowrap' }}
                  disabled={urlLoading || !menuUrl.trim()}
                  onClick={() => {
                    if (!menuUrl.trim()) return;
                    setUrlLoading(true);
                    setUrlNote('');
                    analyzeMenuUrl(menuUrl.trim())
                      .then((result) => {
                        const dishes = (result.dishes || []).map((d: { name: string; dish_type: string }) => ({
                          name: d.name,
                          dish_type: d.dish_type,
                          action: 'want_to_try' as const,
                          rating: 7,
                        }));
                        setUrlDishes(dishes);
                        setUrlNote(result.note || '');
                      })
                      .catch((err) => setUrlNote(err.message || 'Failed to analyze menu'))
                      .finally(() => setUrlLoading(false));
                  }}
                >
                  {urlLoading ? <Loader size={18} className="spin" /> : 'Import'}
                </button>
              </div>
              {urlNote && (
                <p style={{ color: 'var(--coral)', fontSize: 13, textAlign: 'center' }}>{urlNote}</p>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                Works with online menus, PDFs, and image menus
              </p>
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
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
                {urlDishes.length} items found — choose what to add:
              </p>

              {urlDishes.map((dish, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <input
                    className="input"
                    value={dish.name}
                    onChange={(e) => {
                      setUrlDishes((prev) => prev.map((d, j) => j === i ? { ...d, name: e.target.value } : d));
                    }}
                    style={{ fontFamily: "'Righteous', cursive", fontSize: 15, marginBottom: 8, padding: '6px 10px' }}
                  />

                  <div style={{ display: 'flex', gap: 6, marginBottom: dish.action === 'rate' ? 10 : 0 }}>
                    <button
                      className={`chip ${dish.action === 'rate' ? 'active' : ''}`}
                      onClick={() => setUrlDishes((prev) => prev.map((d, j) => j === i ? { ...d, action: d.action === 'rate' ? 'ignore' : 'rate' } : d))}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <Check size={12} /> Rate
                    </button>
                    <button
                      className={`chip ${dish.action === 'want_to_try' ? 'active' : ''}`}
                      onClick={() => setUrlDishes((prev) => prev.map((d, j) => j === i ? { ...d, action: d.action === 'want_to_try' ? 'ignore' : 'want_to_try' } : d))}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <Sparkles size={12} /> Want to Try
                    </button>
                    <button
                      className={`chip ${dish.action === 'ignore' ? '' : ''}`}
                      onClick={() => setUrlDishes((prev) => prev.map((d, j) => j === i ? { ...d, action: 'ignore' } : d))}
                      style={{ flex: 1, justifyContent: 'center', opacity: dish.action === 'ignore' ? 1 : 0.5 }}
                    >
                      <X size={12} /> Skip
                    </button>
                  </div>

                  {dish.action === 'rate' && (
                    <RatingSlider
                      value={dish.rating}
                      onChange={(val) => setUrlDishes((prev) => prev.map((d, j) => j === i ? { ...d, rating: val } : d))}
                    />
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => { setUrlDishes([]); setMenuUrl(''); setUrlNote(''); }}
                >
                  Clear
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={savingUrl || urlDishes.every((d) => d.action === 'ignore')}
                  onClick={async () => {
                    if (!restaurantId) return;
                    setSavingUrl(true);
                    const toAdd = urlDishes.filter((d) => d.action !== 'ignore');
                    for (const dish of toAdd) {
                      await addDish({
                        restaurant_id: restaurantId,
                        name: dish.name,
                        dish_type: dish.dish_type as DishType,
                        want_to_try: dish.action === 'want_to_try',
                        rating: dish.action === 'rate' ? dish.rating : null,
                        notes: '',
                      });
                    }
                    setSavingUrl(false);
                    showToast(`${toAdd.length} dish${toAdd.length !== 1 ? 'es' : ''} added!`);
                    navigate(`/restaurant/${restaurantId}`);
                  }}
                >
                  {savingUrl
                    ? 'Saving...'
                    : `Add ${urlDishes.filter((d) => d.action !== 'ignore').length} Dish${urlDishes.filter((d) => d.action !== 'ignore').length !== 1 ? 'es' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
