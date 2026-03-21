import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, MapPin, Star } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';

export function MapPage() {
  const navigate = useNavigate();
  const { restaurants, lists, cuisineTags, cities } = useApp();

  const [selectedList, setSelectedList] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = restaurants.filter((r) => r.latitude && r.longitude);
    if (favoritesOnly) result = result.filter((r) => r.is_favorite);
    if (selectedList !== 'all') result = result.filter((r) => r.lists?.includes(selectedList));
    if (selectedCity !== 'all') result = result.filter((r) => r.city === selectedCity);
    if (selectedCuisine !== 'all') result = result.filter((r) => r.cuisine_tags?.includes(selectedCuisine));
    return result;
  }, [restaurants, favoritesOnly, selectedList, selectedCity, selectedCuisine]);

  // Build a static map URL using OpenStreetMap embed
  const mapCenter = useMemo(() => {
    if (filtered.length === 0) return { lat: 40.7128, lng: -74.006 }; // NYC default
    const lat = filtered.reduce((s, r) => s + (r.latitude || 0), 0) / filtered.length;
    const lng = filtered.reduce((s, r) => s + (r.longitude || 0), 0) / filtered.length;
    return { lat, lng };
  }, [filtered]);

  return (
    <div>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Map</h1>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <Filter size={20} />
        </button>
      </div>

      {/* Filters */}
      <div style={{ padding: '8px 20px 0', display: 'flex', gap: 8 }}>
        <button
          className={`chip ${favoritesOnly ? 'active' : ''}`}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Star size={12} fill={favoritesOnly ? 'var(--white)' : 'none'} />
          Favorites
        </button>
      </div>

      {showFilters && (
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>List</label>
            <div className="select-wrapper">
              <select value={selectedList} onChange={(e) => setSelectedList(e.target.value)}>
                <option value="all">All Lists</option>
                {lists.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>City</label>
            <div className="select-wrapper">
              <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                <option value="all">All Cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Cuisine</label>
            <div className="select-wrapper">
              <select value={selectedCuisine} onChange={(e) => setSelectedCuisine(e.target.value)}>
                <option value="all">All Cuisines</option>
                {cuisineTags.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div style={{ padding: '12px 20px' }}>
        <div className="map-container">
          <iframe
            title="Restaurant Map"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapCenter.lng - 0.05}%2C${mapCenter.lat - 0.05}%2C${mapCenter.lng + 0.05}%2C${mapCenter.lat + 0.05}&layer=mapnik`}
          />
        </div>

        {/* Restaurant pins list */}
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)', marginBottom: 8 }}>
            Restaurants on Map ({filtered.length})
          </h3>
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No restaurants with location data match your filters.
            </p>
          ) : (
            filtered.map((r) => (
              <div
                key={r.id}
                className="card"
                style={{ marginBottom: 8, cursor: 'pointer', padding: 12 }}
                onClick={() => navigate(`/restaurant/${r.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={16} color="var(--hot-pink)" />
                  <div>
                    <strong style={{ fontFamily: "'Righteous', cursive", fontSize: 14 }}>
                      {r.name}
                    </strong>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.city}{r.state ? `, ${r.state}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
