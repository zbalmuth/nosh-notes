import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  MapPin,
  Phone,
  Globe,
  ExternalLink,
  Plus,
  Trash2,
  BookOpen,
  CheckSquare,
  Share2,
  ArrowUpDown,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  RefreshCw,
  X,
  Tag,
  ShoppingBag,
} from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { searchRestaurants } from '../lib/api';
import { getOrderingLinks } from '../lib/ordering';
import { DishCard } from '../components/DishCard';
import { ScrollBar } from '../components/ScrollBar';
import type { Restaurant, Dish } from '../types';
import { DISH_TYPES } from '../types';

function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http://') || url.startsWith('https://') ? url : undefined;
}

export function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    restaurants,
    lists,
    cuisineTags: allCuisineTags,
    getDishes,
    deleteDish,
    deleteRestaurant,
    updateRestaurant,
    toggleFavorite,
    showToast,
  } = useApp();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroImageError, setHeroImageError] = useState(false);
  const [dishSelectionMode, setDishSelectionMode] = useState(false);
  const [selectedDishIds, setSelectedDishIds] = useState<Set<string>>(new Set());
  const [dishTypeFilters, setDishTypeFilters] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'rating' | 'alpha'>('rating');
  const [sortReversed, setSortReversed] = useState(false);
  const [wantToTryOnly, setWantToTryOnly] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [showOrder, setShowOrder] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editMenuUrl, setEditMenuUrl] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editPriceLevel, setEditPriceLevel] = useState('');
  const [editCuisines, setEditCuisines] = useState<string[]>([]);
  const [editLists, setEditLists] = useState<string[]>([]);
  const [editNewCuisine, setEditNewCuisine] = useState('');
  const [showCuisinePicker, setShowCuisinePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const r = restaurants.find((r) => r.id === id);
    if (r) setRestaurant(r);
  }, [restaurants, id]);

  useEffect(() => {
    if (id) {
      getDishes(id).then((d) => {
        setDishes(d);
        setLoading(false);
      });
    }
  }, [id, getDishes]);

  const hasWantToTry = useMemo(() => dishes.some((d) => d.want_to_try), [dishes]);

  const filteredDishes = useMemo(() => {
    let result = dishes;
    if (wantToTryOnly) {
      result = result.filter((d) => d.want_to_try);
    }
    if (dishTypeFilters.size > 0) {
      result = result.filter((d) => dishTypeFilters.has(d.dish_type));
    }
    return result;
  }, [dishes, dishTypeFilters, wantToTryOnly]);

  const dishTypesPresent = useMemo(() => {
    const types = new Set(dishes.map((d) => d.dish_type));
    return DISH_TYPES.filter((t) => types.has(t.value));
  }, [dishes]);

  const sortedDishes = useMemo(() => {
    const dir = sortReversed ? -1 : 1;
    return [...filteredDishes].sort((a, b) => {
      if (sortBy === 'rating') {
        // Want to try dishes always at the end
        if (a.want_to_try && !b.want_to_try) return 1;
        if (!a.want_to_try && b.want_to_try) return -1;
        // Unrated dishes just before want-to-try
        if (a.rating === null && b.rating !== null) return 1;
        if (a.rating !== null && b.rating === null) return -1;
        // Default: highest first; reversed: lowest first
        return ((b.rating ?? 0) - (a.rating ?? 0)) * dir;
      } else {
        return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [filteredDishes, sortBy, sortReversed]);

  const handleSortToggle = () => {
    if (sortBy === 'rating' && !sortReversed) {
      // First press on rating: reverse it
      setSortReversed(true);
    } else if (sortBy === 'rating' && sortReversed) {
      // Switch to alpha
      setSortBy('alpha');
      setSortReversed(false);
    } else if (sortBy === 'alpha' && !sortReversed) {
      // Reverse alpha
      setSortReversed(true);
    } else {
      // Back to rating default
      setSortBy('rating');
      setSortReversed(false);
    }
  };

  const handleDeleteDish = async (dishId: string) => {
    await deleteDish(dishId);
    setDishes((prev) => prev.filter((d) => d.id !== dishId));
  };

  const toggleDishSelect = (dishId: string) => {
    setSelectedDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
  };

  const exitDishSelectionMode = () => {
    setDishSelectionMode(false);
    setSelectedDishIds(new Set());
  };

  const handleBulkDeleteDishes = async () => {
    if (selectedDishIds.size === 0) return;
    if (!confirm(`Delete ${selectedDishIds.size} dish${selectedDishIds.size > 1 ? 'es' : ''}?`)) return;
    for (const dishId of selectedDishIds) {
      await deleteDish(dishId);
    }
    setDishes((prev) => prev.filter((d) => !selectedDishIds.has(d.id)));
    showToast(`${selectedDishIds.size} dish${selectedDishIds.size > 1 ? 'es' : ''} deleted`);
    exitDishSelectionMode();
  };

  const handleShareDishes = () => {
    if (selectedDishIds.size === 0) return;
    const selected = dishes.filter((d) => selectedDishIds.has(d.id));
    const text = `Dishes at ${restaurant?.name || 'Restaurant'}:\n\n` + selected.map((d) => {
      let line = `• ${d.name}`;
      if (d.want_to_try) line += ' (Want to Try)';
      else if (d.rating !== null) line += ` — ${d.rating.toFixed(1)}/10`;
      if (d.notes) line += ` — ${d.notes}`;
      return line;
    }).join('\n');

    if (navigator.share) {
      navigator.share({ title: `Dishes at ${restaurant?.name}`, text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
    }
    exitDishSelectionMode();
  };

  const openEdit = () => {
    if (!restaurant) return;
    setEditName(restaurant.name);
    setEditAddress(restaurant.address || '');
    setEditCity(restaurant.city || '');
    setEditState(restaurant.state || '');
    setEditPhone(restaurant.phone || '');
    setEditWebsite(restaurant.website || '');
    setEditMenuUrl(restaurant.menu_url || '');
    setEditImageUrl(restaurant.image_url || '');
    setEditPriceLevel(restaurant.price_level || '');
    setEditCuisines(restaurant.cuisine_tags || []);
    setEditLists(restaurant.lists || []);
    setShowCuisinePicker(false);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!restaurant || !editName.trim()) return;
    setSaving(true);
    try {
      await updateRestaurant(restaurant.id, {
        name: editName.trim(),
        address: editAddress,
        city: editCity,
        state: editState,
        phone: editPhone,
        website: editWebsite,
        menu_url: editMenuUrl,
        image_url: editImageUrl,
        price_level: editPriceLevel,
        cuisine_tags: editCuisines,
        lists: editLists,
      });
      setHeroImageError(false);
      setEditing(false);
      showToast('Saved!');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    if (!restaurant) return;
    setRefreshing(true);
    try {
      const results = await searchRestaurants(restaurant.name, 'google', restaurant.city || undefined);
      const match = results[0];
      if (!match) { showToast('No results found'); return; }
      await updateRestaurant(restaurant.id, {
        image_url: match.image_url || restaurant.image_url,
        photos: match.photos?.length ? match.photos : restaurant.photos,
        external_rating: match.rating ?? restaurant.external_rating,
        price_level: match.price_level || restaurant.price_level,
        address: match.address || restaurant.address,
        phone: match.phone || restaurant.phone,
        website: match.website || restaurant.website,
        yelp_url: match.yelp_url || restaurant.yelp_url,
        google_url: match.google_url || restaurant.google_url,
        menu_url: match.menu_url || restaurant.menu_url,
        latitude: match.latitude ?? restaurant.latitude,
        longitude: match.longitude ?? restaurant.longitude,
      });
      setHeroImageError(false);
      showToast('Refreshed from Google!');
    } catch {
      showToast('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  if (!restaurant) {
    return <div className="loading-spinner" style={{ marginTop: 60 }} />;
  }

  // Use stored Yelp URL if available, otherwise build a search URL as fallback
  const yelpUrl = safeHref(restaurant.yelp_url) || (() => {
    const loc = [restaurant.city, restaurant.state].filter(Boolean).join(', ');
    return `https://www.yelp.com/search?find_desc=${encodeURIComponent(restaurant.name)}&find_loc=${encodeURIComponent(loc)}`;
  })();

  const hasLinks = restaurant.website || yelpUrl || restaurant.google_url || restaurant.menu_url;

  return (
    <div>
      {/* Hero */}
      <div className="restaurant-hero">
        {restaurant.image_url && !heroImageError ? (
          <img
            src={restaurant.image_url}
            alt={restaurant.name}
            onError={() => setHeroImageError(true)}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, var(--hot-pink), var(--neon-pink), var(--palm-green))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60,
          }}>
            🍽️
          </div>
        )}
        <div className="hero-overlay">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', color: 'var(--white)', padding: 0 }}
            >
              <ArrowLeft size={24} />
            </button>
            <h1 style={{ flex: 1 }}>{restaurant.name}</h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{ background: 'none', border: 'none', color: 'var(--white)', padding: 4, opacity: refreshing ? 0.5 : 1 }}
              title="Refresh from Google"
            >
              <RefreshCw size={18} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
            <button
              onClick={openEdit}
              style={{ background: 'none', border: 'none', color: 'var(--white)', padding: 4 }}
              title="Edit restaurant"
            >
              <Pencil size={18} />
            </button>
            <button
              className={`favorite-btn ${restaurant.is_favorite ? 'active' : ''}`}
              onClick={() => toggleFavorite(restaurant.id, !restaurant.is_favorite)}
              style={{ color: restaurant.is_favorite ? 'var(--neon-pink)' : 'var(--white)' }}
            >
              <Star size={24} fill={restaurant.is_favorite ? 'var(--neon-pink)' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px' }}>
        {/* Contact & Info — collapsible card */}
        {(restaurant.address || restaurant.city || restaurant.phone || restaurant.price_level || restaurant.external_rating || hasLinks || restaurant.cuisine_tags?.length > 0) && (
          <div style={{
            marginBottom: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}>
            {/* Always visible: address + expand toggle */}
            <button
              onClick={() => setInfoExpanded(v => !v)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                padding: '12px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <MapPin size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text-secondary)' }}>
                {restaurant.address
                  ? `${restaurant.address}${restaurant.city ? `, ${restaurant.city}` : ''}${restaurant.state ? `, ${restaurant.state}` : ''}`
                  : restaurant.city
                    ? `${restaurant.city}${restaurant.state ? `, ${restaurant.state}` : ''}`
                    : 'See details'}
              </span>
              {infoExpanded
                ? <ChevronUp size={15} color="var(--text-muted)" />
                : <ChevronDown size={15} color="var(--text-muted)" />}
            </button>

            {/* Expanded details */}
            {infoExpanded && (
              <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                {/* Phone + Menu on same line */}
                {(restaurant.phone || restaurant.menu_url) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    {restaurant.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={15} color="var(--text-muted)" />
                        <a href={`tel:${restaurant.phone}`} style={{ fontSize: 14, color: 'var(--hot-pink)' }}>
                          {restaurant.phone}
                        </a>
                      </div>
                    )}
                    {safeHref(restaurant.menu_url) && (
                      <a href={safeHref(restaurant.menu_url)} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--electric-blue)' }}>
                        <BookOpen size={14} /> Menu
                      </a>
                    )}
                  </div>
                )}

                {/* Price + rating */}
                {(restaurant.price_level || restaurant.external_rating) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    {restaurant.price_level && (
                      <span style={{ fontFamily: "'Righteous', cursive", color: 'var(--palm-green)', fontSize: 14 }}>
                        {restaurant.price_level}
                      </span>
                    )}
                    {restaurant.external_rating && (
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <span style={{ color: restaurant.yelp_url ? '#f15b31' : 'var(--text-muted)' }}>★</span>{' '}
                        {restaurant.external_rating}{restaurant.yelp_url ? ' Yelp' : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* Links: Website | Google | Yelp */}
                {(restaurant.website || restaurant.google_url || yelpUrl) && (
                  <div className="links-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    {safeHref(restaurant.website) && (
                      <a href={safeHref(restaurant.website)} target="_blank" rel="noopener noreferrer" className="link-chip">
                        <Globe size={14} /> Website
                      </a>
                    )}
                    {safeHref(restaurant.google_url) && (
                      <a href={safeHref(restaurant.google_url)} target="_blank" rel="noopener noreferrer" className="link-chip">
                        <ExternalLink size={14} /> Google
                      </a>
                    )}
                    <a href={yelpUrl} target="_blank" rel="noopener noreferrer" className="link-chip">
                      <ExternalLink size={14} /> Yelp
                    </a>
                  </div>
                )}

                {/* Cuisine tags */}
                {restaurant.cuisine_tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {restaurant.cuisine_tags.map(tag => (
                      <span key={tag} className="chip" style={{ fontSize: 12, padding: '3px 10px' }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Photos */}
        {restaurant.photos?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 14, color: 'var(--hot-pink)', marginBottom: 8, fontFamily: "'Righteous', cursive" }}>
              Photos
            </h3>
            <div className="photo-grid">
              {restaurant.photos.map((photo, i) => (
                <img key={i} src={photo} alt={`${restaurant.name} ${i + 1}`} />
              ))}
            </div>
          </div>
        )}

        <div className="section-divider" />

        {/* Dishes Section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 20, color: 'var(--hot-pink)' }}>
            Dishes ({dishTypeFilters.size > 0 || wantToTryOnly ? `${filteredDishes.length}/${dishes.length}` : dishes.length})
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dishes.length > 0 && (
            <>
              <button
                onClick={handleSortToggle}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)', padding: 4,
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontFamily: "'Righteous', cursive",
                }}
              >
                <ArrowUpDown size={14} />
                <span>{sortBy === 'rating' ? 'Rating' : 'A-Z'}{sortReversed ? ' ↑' : ' ↓'}</span>
              </button>
              {hasWantToTry && (
                <button
                  onClick={() => setWantToTryOnly((v) => !v)}
                  style={{
                    background: 'none', border: 'none',
                    color: wantToTryOnly ? 'var(--neon-pink)' : 'var(--text-muted)',
                    padding: 4,
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontSize: 11, fontFamily: "'Righteous', cursive",
                  }}
                  title="Show only Want to Try"
                >
                  <Sparkles size={14} />
                  <span>Try</span>
                </button>
              )}
              <button
                onClick={() => {
                  if (dishSelectionMode) exitDishSelectionMode();
                  else setDishSelectionMode(true);
                }}
                style={{ background: 'none', border: 'none', color: dishSelectionMode ? 'var(--electric-blue)' : 'var(--text-muted)', padding: 4 }}
              >
                <CheckSquare size={18} />
              </button>
            </>
            )}

            {/* Order delivery popout — opens each app's search for this restaurant */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowOrder(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: showOrder ? 'var(--hot-pink)' : 'none',
                  border: `1px solid ${showOrder ? 'var(--hot-pink)' : 'var(--border)'}`,
                  color: showOrder ? 'white' : 'var(--hot-pink)',
                  borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, fontFamily: "'Righteous', cursive",
                }}
              >
                <ShoppingBag size={14} /> Order
              </button>
              {showOrder && (
                <>
                  <div onClick={() => setShowOrder(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: 6, minWidth: 150,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, padding: '4px 8px 6px' }}>
                      Order delivery
                    </p>
                    {getOrderingLinks(restaurant.name, restaurant.city).map(app => (
                      <a
                        key={app.label}
                        href={app.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowOrder(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px', borderRadius: 8,
                          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                          textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={13} color="var(--hot-pink)" /> {app.label}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dish type filter */}
        {dishes.length > 0 && dishTypesPresent.length > 0 && (
          <ScrollBar className="filter-bar" style={{ marginBottom: 10 }}>
            <button
              className={`chip ${dishTypeFilters.size === 0 ? 'active' : ''}`}
              onClick={() => setDishTypeFilters(new Set())}
              style={{ fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              All
            </button>
            {dishTypesPresent.map((t) => (
              <button
                key={t.value}
                className={`chip ${dishTypeFilters.has(t.value) ? 'active' : ''}`}
                onClick={() => setDishTypeFilters((prev) => {
                  const next = new Set(prev);
                  if (next.has(t.value)) next.delete(t.value);
                  else next.add(t.value);
                  return next;
                })}
                style={{ fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {t.label}
              </button>
            ))}
          </ScrollBar>
        )}

        {/* Dish selection action bar */}
        {dishSelectionMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', marginBottom: 12,
          }}>
            <button
              className="chip"
              onClick={() => setSelectedDishIds(new Set(dishes.map((d) => d.id)))}
              style={{ fontSize: 12 }}
            >
              Select All
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {selectedDishIds.size} selected
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleShareDishes}
              disabled={selectedDishIds.size === 0}
              style={{ background: 'none', border: 'none', color: selectedDishIds.size > 0 ? 'var(--palm-green)' : 'var(--text-muted)', padding: 6 }}
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={handleBulkDeleteDishes}
              disabled={selectedDishIds.size === 0}
              style={{ background: 'none', border: 'none', color: selectedDishIds.size > 0 ? '#FF1744' : 'var(--text-muted)', padding: 6 }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-spinner" />
        ) : dishes.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 20px' }}>
            <h3>No dishes yet</h3>
            <p>Add your first dish to this restaurant</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sortedDishes.map((dish) => (
              <DishCard
                key={dish.id}
                dish={dish}
                compact
                onDelete={dishSelectionMode ? undefined : () => handleDeleteDish(dish.id)}
                onEdit={dishSelectionMode ? undefined : () => navigate(`/restaurant/${id}/dish/${dish.id}/edit`)}
                selectionMode={dishSelectionMode}
                selected={selectedDishIds.has(dish.id)}
                onToggleSelect={() => toggleDishSelect(dish.id)}
              />
            ))}
          </div>
        )}

        {/* Delete restaurant - small, at bottom */}
        <div style={{ marginTop: 16, marginBottom: 80, textAlign: 'center' }}>
          <button
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-muted)', fontSize: 13,
              padding: '8px 16px', cursor: 'pointer',
            }}
            onClick={() => {
              if (confirm(`Delete "${restaurant.name}"?`)) {
                deleteRestaurant(restaurant.id);
                navigate('/');
              }
            }}
          >
            <Trash2 size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Delete Restaurant
          </button>
        </div>
      </div>

      {/* FAB to add dish */}
      <button
        className="fab"
        onClick={() => navigate(`/restaurant/${restaurant.id}/add-dish`)}
      >
        <Plus size={28} />
      </button>

      {/* Edit Restaurant Sheet */}
      {editing && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}
          onClick={() => setEditing(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: '20px 20px 0 0',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '20px 20px 48px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 20, color: 'var(--hot-pink)', flex: 1 }}>
                Edit Restaurant
              </h2>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}>
                <X size={22} />
              </button>
            </div>

            {/* Photo selector */}
            {restaurant.photos?.length > 0 && (
              <div className="form-group">
                <label>Photo</label>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
                  {restaurant.photos.map((p, i) => (
                    <img
                      key={i}
                      src={p}
                      alt=""
                      onClick={() => setEditImageUrl(p)}
                      style={{
                        width: 72, height: 72, objectFit: 'cover', flexShrink: 0,
                        borderRadius: 8,
                        border: editImageUrl === p ? '3px solid var(--hot-pink)' : '2px solid var(--border)',
                        cursor: 'pointer',
                        opacity: editImageUrl === p ? 1 : 0.7,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="form-group">
              <label>Image URL</label>
              <input className="input" placeholder="https://..." value={editImageUrl} onChange={(e) => setEditImageUrl(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Name *</label>
              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input className="input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>City</label>
                <input className="input" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>State</label>
                <input className="input" value={editState} onChange={(e) => setEditState(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input className="input" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Website</label>
              <input className="input" type="url" placeholder="https://..." value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Menu URL</label>
              <input className="input" type="url" placeholder="https://..." value={editMenuUrl} onChange={(e) => setEditMenuUrl(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Price Level</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['$', '$$', '$$$', '$$$$'].map((p) => (
                  <button key={p} className={`chip ${editPriceLevel === p ? 'active' : ''}`} onClick={() => setEditPriceLevel(editPriceLevel === p ? '' : p)}>{p}</button>
                ))}
              </div>
            </div>

            {/* Lists */}
            <div className="form-group">
              <label>Lists</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {lists.map((list) => (
                  <button
                    key={list.id}
                    className={`chip ${editLists.includes(list.name) ? 'active' : ''}`}
                    onClick={() => setEditLists((prev) => prev.includes(list.name) ? prev.filter((l) => l !== list.name) : [...prev, list.name])}
                  >
                    {list.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Cuisine Tags */}
            <div className="form-group">
              <label>Cuisines</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: editCuisines.length > 0 ? 10 : 0 }}>
                {editCuisines.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setEditCuisines((prev) => prev.filter((t) => t !== tag))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <Tag size={11} color="var(--hot-pink)" />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tag}</span>
                    <X size={10} color="var(--text-muted)" />
                  </button>
                ))}
              </div>
              {!showCuisinePicker ? (
                <button
                  onClick={() => setShowCuisinePicker(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed var(--border)', borderRadius: 20, padding: '4px 12px', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <Plus size={13} /> Add cuisine
                </button>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      className="input"
                      placeholder="Type a cuisine..."
                      value={editNewCuisine}
                      onChange={(e) => setEditNewCuisine(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editNewCuisine.trim()) {
                          if (!editCuisines.includes(editNewCuisine.trim())) setEditCuisines((prev) => [...prev, editNewCuisine.trim()]);
                          setEditNewCuisine('');
                          setShowCuisinePicker(false);
                        }
                      }}
                      autoFocus
                      style={{ flex: 1, fontSize: 13 }}
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        if (editNewCuisine.trim() && !editCuisines.includes(editNewCuisine.trim())) setEditCuisines((prev) => [...prev, editNewCuisine.trim()]);
                        setEditNewCuisine('');
                        setShowCuisinePicker(false);
                      }}
                      style={{ padding: '8px 12px' }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Array.from(new Set([...allCuisineTags, ...editCuisines])).sort().filter((t) => !editCuisines.includes(t)).map((tag) => (
                      <button
                        key={tag}
                        className="chip"
                        onClick={() => { setEditCuisines((prev) => [...prev, tag]); setShowCuisinePicker(false); }}
                        style={{ fontSize: 12 }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowCuisinePicker(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '8px 0 0' }}>Done</button>
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8 }}
              onClick={handleSaveEdit}
              disabled={!editName.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
