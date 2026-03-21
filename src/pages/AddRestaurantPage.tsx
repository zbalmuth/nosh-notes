import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Plus } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { SearchRestaurantDialog } from '../components/SearchRestaurantDialog';
import type { SearchResult } from '../types';

export function AddRestaurantPage() {
  const navigate = useNavigate();
  const { lists, cuisineTags: existingTags, addRestaurant, addList } = useApp();

  const [showSearch, setShowSearch] = useState(false);
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

  // Auto-detect city
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

  const handleSearchSelect = (result: SearchResult) => {
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
    setShowSearch(false);
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
        address,
        city,
        state,
        country: '',
        phone,
        website,
        yelp_url: yelpUrl,
        google_url: googleUrl,
        menu_url: menuUrl,
        image_url: imageUrl,
        photos,
        price_level: priceLevel,
        external_rating: externalRating,
        cuisine_tags: selectedCuisines,
        lists: selectedLists,
        is_favorite: false,
        latitude,
        longitude,
      });
      navigate(`/restaurant/${added.id}`);
    } catch (err) {
      console.error('Failed to add restaurant', err);
    } finally {
      setSaving(false);
    }
  };

  const allTags = Array.from(new Set([...existingTags, ...selectedCuisines])).sort();

  return (
    <div>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--burnt-orange)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Add Restaurant</h1>
      </div>

      <div style={{ padding: '16px 20px 100px' }}>
        {/* Search button */}
        <button
          className="btn btn-secondary"
          style={{ width: '100%', marginBottom: 20 }}
          onClick={() => setShowSearch(true)}
        >
          <Search size={16} />
          Search Yelp / Google
        </button>

        {/* Name */}
        <div className="form-group">
          <label>Restaurant Name *</label>
          <input
            className="input"
            placeholder="Enter restaurant name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Address */}
        <div className="form-group">
          <label>Address</label>
          <input
            className="input"
            placeholder="Street address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        {/* City / State */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>City</label>
            <input
              className="input"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>State</label>
            <input
              className="input"
              placeholder="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </div>
        </div>

        {/* Phone */}
        <div className="form-group">
          <label>Phone</label>
          <input
            className="input"
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* Website */}
        <div className="form-group">
          <label>Website</label>
          <input
            className="input"
            type="url"
            placeholder="https://..."
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {/* Price Level */}
        <div className="form-group">
          <label>Price Level</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['$', '$$', '$$$', '$$$$'].map((p) => (
              <button
                key={p}
                className={`chip ${priceLevel === p ? 'active' : ''}`}
                onClick={() => setPriceLevel(priceLevel === p ? '' : p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Lists */}
        <div className="form-group">
          <label>Add to Lists</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

        {/* Image preview */}
        {imageUrl && (
          <div className="form-group">
            <label>Preview</label>
            <img
              src={imageUrl}
              alt="Restaurant"
              style={{
                width: '100%',
                height: 160,
                objectFit: 'cover',
                borderRadius: 'var(--radius)',
                border: '2px solid var(--border)',
              }}
            />
          </div>
        )}

        {/* Save */}
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 8 }}
          onClick={handleSave}
          disabled={!name.trim() || saving}
        >
          {saving ? 'Saving...' : 'Add Restaurant'}
        </button>
      </div>

      <SearchRestaurantDialog
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={handleSearchSelect}
      />
    </div>
  );
}
