import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, Star, X, LocateFixed } from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { supabase } from '../lib/supabase';
import { detectLocation, getLocationPref } from '../lib/location';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Restaurant } from '../types';

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: '<div class="user-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(km: number): string {
  const mi = km * 0.621371;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

export function MapPage() {
  const navigate = useNavigate();
  const { restaurants, lists, cuisineTags, cities } = useApp();

  const [selectedList, setSelectedList] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [maxDistanceMi, setMaxDistanceMi] = useState('all');
  const [minRating, setMinRating] = useState('all');
  const [selectedPrice, setSelectedPrice] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const hasRestoredView = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

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

  const applyUserMarker = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lng]);
    } else {
      userMarkerRef.current = L.marker([lat, lng], { icon: userLocationIcon })
        .bindPopup('You are here')
        .addTo(mapRef.current);
    }
  }, []);

  const locateUser = useCallback(() => {
    if (!mapRef.current) return;
    setLocating(true);
    // skipIfDenied=false: user explicitly clicked the button
    detectLocation(false).then((loc) => {
      if (loc && mapRef.current) {
        setUserLocation({ lat: loc.lat, lng: loc.lng });
        mapRef.current.flyTo([loc.lat, loc.lng], 15, { duration: 1 });
        applyUserMarker(loc.lat, loc.lng);
      }
      setLocating(false);
    }).catch(() => setLocating(false));
  }, [applyUserMarker]);

  const filtered = useMemo(() => {
    let result = restaurants.filter((r) => r.latitude && r.longitude);
    if (favoritesOnly) result = result.filter((r) => r.is_favorite);
    if (selectedList !== 'all') result = result.filter((r) => r.lists?.includes(selectedList));
    if (selectedCity !== 'all') result = result.filter((r) => r.city === selectedCity);
    if (selectedCuisine !== 'all') result = result.filter((r) => r.cuisine_tags?.includes(selectedCuisine));
    if (selectedPrice !== 'all') result = result.filter((r) => r.price_level === selectedPrice);
    if (minRating !== 'all') {
      const min = parseFloat(minRating);
      result = result.filter((r) => r.external_rating != null && r.external_rating >= min);
    }
    if (maxDistanceMi !== 'all' && userLocation) {
      const maxKm = parseFloat(maxDistanceMi) * 1.60934;
      result = result.filter((r) => {
        if (!r.latitude || !r.longitude) return false;
        return haversineKm(userLocation.lat, userLocation.lng, r.latitude, r.longitude) <= maxKm;
      });
    }
    return result;
  }, [restaurants, favoritesOnly, selectedList, selectedCity, selectedCuisine, selectedPrice, minRating, maxDistanceMi, userLocation]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initMap = async () => {
      let center: [number, number] = [40.7128, -74.006];
      let zoom = 12;

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

      map.on('moveend', () => {
        const c = map.getCenter();
        saveMapView(c.lat, c.lng, map.getZoom());
      });

      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
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

  // Auto-detect user location (skip if previously denied)
  useEffect(() => {
    if (getLocationPref() === 'denied') return;
    detectLocation().then((loc) => {
      if (!loc) return;
      setUserLocation({ lat: loc.lat, lng: loc.lng });
      applyUserMarker(loc.lat, loc.lng);
    });
  }, [applyUserMarker]);

  // Auto-get location when distance filter is enabled and we don't have it yet
  useEffect(() => {
    if (maxDistanceMi === 'all' || userLocation) return;
    setLocating(true);
    detectLocation(false).then((loc) => {
      if (loc) {
        setUserLocation({ lat: loc.lat, lng: loc.lng });
        applyUserMarker(loc.lat, loc.lng);
      }
      setLocating(false);
    }).catch(() => setLocating(false));
  }, [maxDistanceMi, userLocation, applyUserMarker]);

  // Update markers when filtered restaurants change
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    if (filtered.length === 0) return;

    const bounds = L.latLngBounds([]);

    filtered.forEach((r) => {
      if (!r.latitude || !r.longitude) return;

      const distKm = userLocation
        ? haversineKm(userLocation.lat, userLocation.lng, r.latitude, r.longitude)
        : null;
      const distStr = distKm != null ? `<br/><span style="font-size:11px;color:#4caf50;">${fmtDistance(distKm)} away</span>` : '';

      const marker = L.marker([r.latitude, r.longitude], { icon: markerIcon });

      marker.bindPopup(`
        <div style="font-family: sans-serif; min-width: 120px;">
          <strong style="font-size: 14px;">${r.name}</strong>
          <br/><span style="font-size: 12px; color: #666;">${r.city || ''}${r.state ? ', ' + r.state : ''}</span>
          ${r.price_level ? `<span style="margin-left:6px;font-size:12px;color:#388e3c;font-weight:600;">${r.price_level}</span>` : ''}
          ${r.external_rating != null ? `<br/><span style="font-size:11px;color:#f9a825;">★ ${r.external_rating.toFixed(1)}</span>` : ''}
          ${r.cuisine_tags?.length ? '<br/><span style="font-size: 11px; color: #999;">' + r.cuisine_tags.slice(0, 2).join(', ') + '</span>' : ''}
          ${distStr}
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
  }, [filtered, mapReady, userLocation]);

  const activeFilterCount = [
    selectedCity !== 'all',
    selectedCuisine !== 'all',
    selectedPrice !== 'all',
    minRating !== 'all',
    maxDistanceMi !== 'all',
    favoritesOnly,
  ].filter(Boolean).length;

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
          onClick={locateUser}
          style={{ background: 'none', border: 'none', color: locating ? 'var(--text-muted)' : 'var(--hot-pink)', marginRight: 4 }}
          disabled={locating}
        >
          <LocateFixed size={20} />
        </button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{ background: 'none', border: 'none', color: activeFilterCount > 0 ? 'var(--electric-blue)' : 'var(--hot-pink)', position: 'relative' }}
        >
          <Filter size={20} />
          {activeFilterCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: 'var(--electric-blue)', color: 'white',
              borderRadius: '50%', width: 16, height: 16,
              fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700,
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* List chips — always visible */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px',
        overflowX: 'auto', flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        <button
          className={`chip ${selectedList === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedList('all')}
          style={{ flexShrink: 0 }}
        >
          All
        </button>
        {lists.map((l) => (
          <button
            key={l.id}
            className={`chip ${selectedList === l.name ? 'active' : ''}`}
            onClick={() => setSelectedList(selectedList === l.name ? 'all' : l.name)}
            style={{ flexShrink: 0 }}
          >
            {l.name}
          </button>
        ))}
      </div>

      {/* Quick filter chips */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <button
          className={`chip ${favoritesOnly ? 'active' : ''}`}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Star size={12} fill={favoritesOnly ? 'var(--white)' : 'none'} />
          Favorites
        </button>
        {selectedCuisine !== 'all' && (
          <span className="chip active" style={{ fontSize: 11 }} onClick={() => setSelectedCuisine('all')}>
            {selectedCuisine} <X size={10} style={{ marginLeft: 2 }} />
          </span>
        )}
        {selectedPrice !== 'all' && (
          <span className="chip active" style={{ fontSize: 11 }} onClick={() => setSelectedPrice('all')}>
            {selectedPrice} <X size={10} style={{ marginLeft: 2 }} />
          </span>
        )}
        {minRating !== 'all' && (
          <span className="chip active" style={{ fontSize: 11 }} onClick={() => setMinRating('all')}>
            ★ {minRating}+ <X size={10} style={{ marginLeft: 2 }} />
          </span>
        )}
        {maxDistanceMi !== 'all' && (
          <span className="chip active" style={{ fontSize: 11 }} onClick={() => setMaxDistanceMi('all')}>
            ≤ {maxDistanceMi} mi <X size={10} style={{ marginLeft: 2 }} />
          </span>
        )}
      </div>

      {showFilters && (
        <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Distance{!userLocation && maxDistanceMi !== 'all' ? ' (locating…)' : ''}</label>
              <div className="select-wrapper">
                <select value={maxDistanceMi} onChange={(e) => setMaxDistanceMi(e.target.value)}>
                  <option value="all">Any distance</option>
                  <option value="1">Within 1 mi</option>
                  <option value="5">Within 5 mi</option>
                  <option value="10">Within 10 mi</option>
                  <option value="25">Within 25 mi</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Min Rating</label>
              <div className="select-wrapper">
                <select value={minRating} onChange={(e) => setMinRating(e.target.value)}>
                  <option value="all">Any rating</option>
                  <option value="3">3+ stars</option>
                  <option value="4">4+ stars</option>
                  <option value="4.5">4.5+ stars</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Price</label>
              <div className="select-wrapper">
                <select value={selectedPrice} onChange={(e) => setSelectedPrice(e.target.value)}>
                  <option value="all">Any price</option>
                  <option value="$">$</option>
                  <option value="$$">$$</option>
                  <option value="$$$">$$$</option>
                  <option value="$$$$">$$$$</option>
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
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>City</label>
              <div className="select-wrapper">
                <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                  <option value="all">All Cities</option>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div ref={mapContainerRef} style={{ flex: 1, minHeight: 300 }} />

      {/* Selected restaurant card */}
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
                  {selectedRestaurant.price_level && (
                    <span style={{ marginLeft: 8, color: 'var(--palm-green)', fontWeight: 600 }}>
                      {selectedRestaurant.price_level}
                    </span>
                  )}
                </p>
                {userLocation && selectedRestaurant.latitude && selectedRestaurant.longitude && (
                  <p style={{ fontSize: 11, color: '#4caf50', marginTop: 2 }}>
                    {fmtDistance(haversineKm(userLocation.lat, userLocation.lng, selectedRestaurant.latitude, selectedRestaurant.longitude))} away
                  </p>
                )}
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
