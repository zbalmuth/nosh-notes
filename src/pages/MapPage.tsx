import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, Star, X } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { supabase } from '../lib/supabase';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Restaurant } from '../types';

// Custom marker icon
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// User location marker — blue pulsing dot
const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: '<div class="user-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

export function MapPage() {
  const navigate = useNavigate();
  const { restaurants, lists, cuisineTags, cities } = useApp();

  const [selectedList, setSelectedList] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const hasRestoredView = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Debounced save to Supabase
  const saveMapView = useCallback((lat: number, lng: number, zoom: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_preferences').upsert({
        user_id: user.id,
        map_lat: lat,
        map_lng: lng,
        map_zoom: zoom,
        updated_at: new Date().toISOString(),
      });
    }, 1000);
  }, []);

  const filtered = useMemo(() => {
    let result = restaurants.filter((r) => r.latitude && r.longitude);
    if (favoritesOnly) result = result.filter((r) => r.is_favorite);
    if (selectedList !== 'all') result = result.filter((r) => r.lists?.includes(selectedList));
    if (selectedCity !== 'all') result = result.filter((r) => r.city === selectedCity);
    if (selectedCuisine !== 'all') result = result.filter((r) => r.cuisine_tags?.includes(selectedCuisine));
    return result;
  }, [restaurants, favoritesOnly, selectedList, selectedCity, selectedCuisine]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initMap = async () => {
      let center: [number, number] = [40.7128, -74.006];
      let zoom = 12;

      // Load saved view from Supabase
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_preferences')
            .select('map_lat, map_lng, map_zoom')
            .eq('user_id', user.id)
            .single();
          if (data?.map_lat != null && data?.map_lng != null) {
            center = [data.map_lat, data.map_lng];
            zoom = data.map_zoom ?? 12;
            hasRestoredView.current = true;
          }
        }
      } catch {}

      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Persist map position on every move/zoom
      map.on('moveend', () => {
        const c = map.getCenter();
        saveMapView(c.lat, c.lng, map.getZoom());
      });

      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = null;
      }
    };
  }, [saveMapView]);

  // Get user location
  useEffect(() => {
    if (!mapRef.current || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (mapRef.current) {
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([latitude, longitude]);
          } else {
            userMarkerRef.current = L.marker([latitude, longitude], { icon: userLocationIcon })
              .bindPopup('You are here')
              .addTo(mapRef.current);
          }
        }
      },
      (err) => console.warn('Geolocation failed:', err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Update markers when filtered restaurants change
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    if (filtered.length === 0) return;

    const bounds = L.latLngBounds([]);

    filtered.forEach((r) => {
      if (!r.latitude || !r.longitude) return;

      const marker = L.marker([r.latitude, r.longitude], { icon: markerIcon });

      marker.bindPopup(`
        <div style="font-family: sans-serif; min-width: 120px;">
          <strong style="font-size: 14px;">${r.name}</strong>
          <br/><span style="font-size: 12px; color: #666;">${r.city || ''}${r.state ? ', ' + r.state : ''}</span>
          ${r.cuisine_tags?.length ? '<br/><span style="font-size: 11px; color: #999;">' + r.cuisine_tags.slice(0, 2).join(', ') + '</span>' : ''}
        </div>
      `, { closeButton: false });

      marker.on('click', () => {
        setSelectedRestaurant(r);
      });

      marker.addTo(markersRef.current!);
      bounds.extend([r.latitude, r.longitude]);
    });

    if (bounds.isValid() && !hasRestoredView.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1 }}>Map ({filtered.length})</h1>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          <Filter size={20} />
        </button>
      </div>

      {/* Quick filters */}
      <div style={{ padding: '8px 20px 0', display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          className={`chip ${favoritesOnly ? 'active' : ''}`}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Star size={12} fill={favoritesOnly ? 'var(--white)' : 'none'} />
          Favorites
        </button>
        {selectedList !== 'all' && (
          <span className="chip active" style={{ fontSize: 11 }}>{selectedList}</span>
        )}
        {selectedCuisine !== 'all' && (
          <span className="chip active" style={{ fontSize: 11 }}>{selectedCuisine}</span>
        )}
      </div>

      {showFilters && (
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
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
      <div ref={mapContainerRef} style={{ flex: 1, minHeight: 300 }} />

      {/* Selected restaurant popup */}
      {selectedRestaurant && (
        <div
          style={{
            position: 'absolute', bottom: 80, left: 16, right: 16,
            zIndex: 1000,
          }}
        >
          <div
            className="card neon-glow"
            style={{ padding: 16, cursor: 'pointer', position: 'relative' }}
            onClick={() => navigate(`/restaurant/${selectedRestaurant.id}`)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedRestaurant(null); }}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4,
              }}
            >
              <X size={16} />
            </button>
            <div style={{ display: 'flex', gap: 12 }}>
              {selectedRestaurant.image_url && (
                <img
                  src={selectedRestaurant.image_url}
                  alt={selectedRestaurant.name}
                  style={{
                    width: 60, height: 60, objectFit: 'cover',
                    borderRadius: 10, border: '2px solid var(--border)',
                  }}
                />
              )}
              <div>
                <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)' }}>
                  {selectedRestaurant.name}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {selectedRestaurant.city}{selectedRestaurant.state ? `, ${selectedRestaurant.state}` : ''}
                </p>
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {selectedRestaurant.cuisine_tags?.slice(0, 3).map((t) => (
                    <span key={t} className="chip" style={{ fontSize: 10, padding: '2px 8px' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--electric-blue)', marginTop: 8, textAlign: 'center' }}>
              Tap to view details →
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
