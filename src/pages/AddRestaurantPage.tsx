import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus, Loader, X } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { searchRestaurants } from '../lib/api';
import type { SearchResult, SearchProvider } from '../types';

type Tab = 'search' | 'manual';

function SearchResultCard({ result, onSelect, onDismiss }: { result: SearchResult; onSelect: () => void; onDismiss: () => void }) {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
      return;
    }
    if (!isHorizontalSwipe.current) return;
    if (deltaX < 0) setSwipeX(Math.max(deltaX, -100));
    else setSwipeX(0);
  };

  const handleTouchEnd = () => {
    setSwiping(false);
    isHorizontalSwipe.current = null;
    if (swipeX < -60) {
      onDismiss();
    } else {
      setSwipeX(0);
    }
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius)', marginBottom: 8 }}>
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--text-muted)', borderRadius: 'var(--radius)',
      }}>
        <X size={20} color="white" />
      </div>
      <div
        className="card"
        style={{
          marginBottom: 0, cursor: 'pointer', position: 'relative', zIndex: 1,
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onClick={() => { if (swipeX === 0) onSelect(); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          {result.image_url && (
            <img
              src={result.image_url}
              alt={result.name}
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--border)' }}
            />
          )}
          <div style={{ flex: 1 }}>
            <h4 style={{ fontFamily: "'Righteous', cursive", fontSize: 14 }}>{result.name}</h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.address}</p>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
              {result.price_level && (
                <span style={{ fontSize: 12, color: 'var(--palm-green)', fontWeight: 600 }}>{result.price_level}</span>
              )}
              {result.rating && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>★ {result.rating}</span>
              )}
            </div>
            {result.cuisine_tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                {result.cuisine_tags.slice(0, 3).map((t) => (
                  <span key={t} className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AddRestaurantPage() {
  const navigate = useNavigate();
  const { lists, cuisineTags: existingTags, addRestaurant, addList } = useApp();

  const [tab, setTab] = useState<Tab>('search');

  // Search state
  const [query, setQuery] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [provider, setProvider] = useState<SearchProvider>('google');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  // Form state (shared between search-selected and manual)
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [yelpUrl, setYelpUrl] = useState('');
  const [googleUrl, setGoogleUrl] = useState('');
  const [menuUrl, setMenuUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [priceLevel, setPriceLevel] = useState('');
  const [externalRating, setExternalRating] = useState<number | null>(null);
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [newCuisine, setNewCuisine] = useState('');
  const [selectedLists, setSelectedLists] = useState<string[]>(['My Restaurants']);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showNewList, setShowNewList] = useState(false);

  // Auto-detect location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
          );
          const data = await res.json();
          const detectedCity = data.address?.city || data.address?.town || data.address?.village || '';
          if (detectedCity && !searchLocation) setSearchLocation(detectedCity);
          if (detectedCity && !city) setCity(detectedCity);
          const detectedState = data.address?.state || '';
          if (detectedState && !state) setState(detectedState);
        } catch { /* ignore */ }
      });
    }
  }, []);

  // Ensure "My Restaurants" list exists
  useEffect(() => {
    if (lists.length === 0) {
      addList('My Restaurants');
    }
  }, [lists, addList]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const data = await searchRestaurants(query, provider, searchLocation || undefined);
      setResults(data);
      if (data.length === 0) setSearchError('No results found. Try a different search.');
    } catch (err: any) {
      const msg = err?.message || err?.context?.message || String(err);
      setSearchError(`Search failed: ${msg}`);
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setSelectedResult(result);
    setName(result.name);
    setAddress(result.address);
    setCity(result.city);
    setState(result.state);
    setPhone(result.phone);
    setWebsite(result.website);
    setYelpUrl(result.yelp_url);
    setGoogleUrl(result.google_url);
    setMenuUrl(result.menu_url);
    setImageUrl(result.image_url);
    setPhotos(result.photos || []);
    setPriceLevel(result.price_level);
    setExternalRating(result.rating);
    setSelectedCuisines(result.cuisine_tags || []);
    if (result.latitude) setLatitude(result.latitude);
    if (result.longitude) setLongitude(result.longitude);
  };

  const toggleCuisine = (cuisine: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    );
  };

  const addNewCuisine = () => {
    if (newCuisine.trim() && !selectedCuisines.includes(newCuisine.trim())) {
      setSelectedCuisines((prev) => [...prev, newCuisine.trim()]);
      setNewCuisine('');
    }
  };

  const toggleList = (listName: string) => {
    setSelectedLists((prev) =>
      prev.includes(listName) ? prev.filter((l) => l !== listName) : [...prev, listName]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const added = await addRestaurant({
        name: name.trim(),
        address, city, state, country: '',
        phone, website,
        yelp_url: yelpUrl, google_url: googleUrl,
        menu_url: menuUrl, image_url: imageUrl, photos,
        price_level: priceLevel, external_rating: externalRating,
        cuisine_tags: selectedCuisines, lists: selectedLists,
        is_favorite: false, latitude, longitude,
      });
      navigate(`/restaurant/${added.id}`);
    } catch (err) {
      console.error('Failed to add restaurant', err);
    } finally {
      setSaving(false);
    }
  };

  const clearSelection = () => {
    setSelectedResult(null);
    setName(''); setAddress(''); setCity(''); setState('');
    setPhone(''); setWebsite(''); setYelpUrl(''); setGoogleUrl('');
    setMenuUrl(''); setImageUrl(''); setPhotos([]);
    setPriceLevel(''); setExternalRating(null);
    setSelectedCuisines([]); setSelectedLists(['My Restaurants']);
  };

  const allTags = Array.from(new Set([...existingTags, ...selectedCuisines])).sort();
  const showForm = tab === 'manual' || selectedResult;

  return (
    <div>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Add Restaurant</h1>
      </div>

      <div style={{ padding: '16px 20px 100px' }}>
        {/* Tabs */}
        <div className="provider-toggle" style={{ marginBottom: 20 }}>
          <button
            className={tab === 'search' ? 'active' : ''}
            onClick={() => { setTab('search'); clearSelection(); }}
            style={{ flex: 1 }}
          >
            <Search size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Find Restaurant
          </button>
          <button
            className={tab === 'manual' ? 'active' : ''}
            onClick={() => { setTab('manual'); clearSelection(); setResults([]); }}
            style={{ flex: 1 }}
          >
            Manual Entry
          </button>
        </div>

        {/* Search Tab */}
        {tab === 'search' && !selectedResult && (
          <>
            {/* Provider toggle */}
            <div className="provider-toggle" style={{ marginBottom: 12 }}>
              <button
                className={provider === 'google' ? 'active' : ''}
                onClick={() => setProvider('google')}
              >
                Google
              </button>
              <button
                className={provider === 'yelp' ? 'active' : ''}
                onClick={() => setProvider('yelp')}
              >
                Yelp
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <input
                className="input"
                placeholder="Restaurant name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                autoFocus
              />
              <input
                className="input"
                placeholder="City or location (auto-detected)"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
                {searching ? <Loader size={18} className="spin" /> : <Search size={18} />}
                Search
              </button>
            </div>

            {searchError && (
              <p style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                {searchError}
              </p>
            )}

            {/* Results */}
            <div>
              {results.map((result) => (
                <SearchResultCard
                  key={result.id}
                  result={result}
                  onSelect={() => handleSelectResult(result)}
                  onDismiss={() => setResults((prev) => prev.filter((r) => r.id !== result.id))}
                />
              ))}
            </div>
          </>
        )}

        {/* Selected from search - show summary + customization */}
        {tab === 'search' && selectedResult && (
          <>
            <div className="card" style={{ marginBottom: 16, position: 'relative' }}>
              <button
                onClick={clearSelection}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4,
                }}
              >
                <X size={16} />
              </button>
              <div style={{ display: 'flex', gap: 12 }}>
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={name}
                    style={{
                      width: 72, height: 72, objectFit: 'cover',
                      borderRadius: 10, border: '2px solid var(--border)',
                    }}
                  />
                )}
                <div>
                  <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)' }}>
                    {name}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{address}</p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {priceLevel && <span style={{ fontSize: 12, color: 'var(--palm-green)', fontWeight: 600 }}>{priceLevel}</span>}
                    {externalRating && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>★ {externalRating}</span>}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Form fields - shown for manual or after search selection */}
        {showForm && (
          <>
            {/* Only show name/address/etc fields for manual entry */}
            {tab === 'manual' && (
              <>
                <div className="form-group">
                  <label>Restaurant Name *</label>
                  <input className="input" placeholder="Enter restaurant name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input className="input" placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>City</label>
                    <input className="input" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>State</label>
                    <input className="input" placeholder="State" value={state} onChange={(e) => setState(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input className="input" type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Website</label>
                  <input className="input" type="url" placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Price Level</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['$', '$$', '$$$', '$$$$'].map((p) => (
                      <button key={p} className={`chip ${priceLevel === p ? 'active' : ''}`} onClick={() => setPriceLevel(priceLevel === p ? '' : p)}>{p}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Lists - always shown */}
            <div className="form-group">
              <label>Add to Lists</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {lists.map((list) => (
                  <button
                    key={list.id}
                    className={`chip ${selectedLists.includes(list.name) ? 'active' : ''}`}
                    onClick={() => toggleList(list.name)}
                  >
                    {list.name}
                  </button>
                ))}
              </div>
              {showNewList ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    placeholder="New list name..."
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newListName.trim()) {
                        const list = await addList(newListName.trim());
                        setSelectedLists((prev) => [...prev, list.name]);
                        setNewListName('');
                        setShowNewList(false);
                      }
                    }}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ padding: '8px 16px' }}
                    onClick={async () => {
                      if (newListName.trim()) {
                        const list = await addList(newListName.trim());
                        setSelectedLists((prev) => [...prev, list.name]);
                        setNewListName('');
                        setShowNewList(false);
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 13, padding: '8px 16px' }}
                  onClick={() => setShowNewList(true)}
                >
                  <Plus size={14} />
                  New List
                </button>
              )}
            </div>

            {/* Cuisine Tags */}
            <div className="form-group">
              <label>Cuisines</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className={`chip ${selectedCuisines.includes(tag) ? 'active' : ''}`}
                    onClick={() => toggleCuisine(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="Add new cuisine..."
                  value={newCuisine}
                  onChange={(e) => setNewCuisine(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addNewCuisine()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" onClick={addNewCuisine} style={{ padding: '8px 12px' }}>
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Save */}
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={handleSave}
              disabled={!name.trim() || saving}
            >
              {saving ? 'Saving...' : 'Add Restaurant'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
