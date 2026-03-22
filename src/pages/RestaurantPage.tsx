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
  ChevronDown,
  ChevronUp,
  Trash2,
  Tag,
  Info,
  BookOpen,
  CheckSquare,
  Share2,
} from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { DishCard } from '../components/DishCard';
import type { Restaurant, Dish } from '../types';

const RATING_GROUPS = [
  { label: 'Amazing', min: 9.5, max: 10 },
  { label: 'Great', min: 7.5, max: 9 },
  { label: 'Good', min: 5.5, max: 7 },
  { label: 'Okay', min: 3.5, max: 5 },
  { label: 'Edible', min: 1.5, max: 3 },
  { label: 'Dislike', min: 0, max: 1 },
  { label: 'Want to Try', min: -1, max: -1 },
];

export function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    restaurants,
    getDishes,
    deleteDish,
    deleteRestaurant,
    toggleFavorite,
    showToast,
  } = useApp();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [dishSelectionMode, setDishSelectionMode] = useState(false);
  const [selectedDishIds, setSelectedDishIds] = useState<Set<string>>(new Set());

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

  const groupedDishes = useMemo(() => {
    const groups: { label: string; dishes: Dish[] }[] = [];
    for (const group of RATING_GROUPS) {
      let matched: Dish[];
      if (group.label === 'Want to Try') {
        matched = dishes.filter((d) => d.want_to_try);
      } else {
        matched = dishes.filter(
          (d) => !d.want_to_try && d.rating !== null && d.rating >= group.min && d.rating <= group.max
        );
      }
      if (matched.length > 0) {
        groups.push({ label: group.label, dishes: matched });
      }
    }
    const unrated = dishes.filter((d) => !d.want_to_try && d.rating === null);
    if (unrated.length > 0) {
      groups.push({ label: 'Unrated', dishes: unrated });
    }
    return groups;
  }, [dishes]);

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
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

  if (!restaurant) {
    return <div className="loading-spinner" style={{ marginTop: 60 }} />;
  }

  const hasContactInfo = restaurant.phone || restaurant.website || restaurant.yelp_url || restaurant.google_url || restaurant.menu_url;
  const hasLinks = restaurant.website || restaurant.yelp_url || restaurant.google_url || restaurant.menu_url;

  return (
    <div>
      {/* Hero */}
      <div className="restaurant-hero">
        {restaurant.image_url ? (
          <img src={restaurant.image_url} alt={restaurant.name} />
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
        {/* Quick info — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="info-row" style={{ padding: 0 }}>
            <MapPin size={14} />
            <span style={{ fontSize: 13 }}>
              {restaurant.city}{restaurant.state ? `, ${restaurant.state}` : ''}
            </span>
          </div>
          {restaurant.price_level && (
            <span style={{ fontFamily: "'Righteous', cursive", color: 'var(--palm-green)', fontSize: 14 }}>
              {restaurant.price_level}
            </span>
          )}
          {restaurant.external_rating && (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>★ {restaurant.external_rating}</span>
          )}
        </div>

        {/* Cuisine Tags */}
        {restaurant.cuisine_tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {restaurant.cuisine_tags.map((tag) => (
              <span key={tag} className="chip" style={{ fontSize: 11, padding: '2px 10px' }}>
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Collapsible Contact & Info Section */}
        {(hasContactInfo || restaurant.address) && (
          <div style={{ marginTop: 12 }}>
            <button
              className="collapsible-header"
              onClick={() => setInfoExpanded(!infoExpanded)}
              style={{ padding: '8px 0' }}
            >
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <Info size={14} />
                Contact & Details
              </h3>
              {infoExpanded ? (
                <ChevronUp size={18} color="var(--text-muted)" />
              ) : (
                <ChevronDown size={18} color="var(--text-muted)" />
              )}
            </button>

            {infoExpanded && (
              <div style={{ paddingBottom: 8 }}>
                {/* Full address */}
                {restaurant.address && (
                  <div className="info-row">
                    <MapPin size={16} />
                    <span>{restaurant.address}{restaurant.city ? `, ${restaurant.city}` : ''}{restaurant.state ? `, ${restaurant.state}` : ''}</span>
                  </div>
                )}

                {/* Phone */}
                {restaurant.phone && (
                  <div className="info-row">
                    <Phone size={16} />
                    <a href={`tel:${restaurant.phone}`} style={{ color: 'var(--hot-pink)' }}>
                      {restaurant.phone}
                    </a>
                  </div>
                )}

                {/* Links */}
                {hasLinks && (
                  <div className="links-row" style={{ marginTop: 8 }}>
                    {restaurant.website && (
                      <a href={restaurant.website} target="_blank" rel="noopener" className="link-chip">
                        <Globe size={14} /> Website
                      </a>
                    )}
                    {restaurant.menu_url && (
                      <a href={restaurant.menu_url} target="_blank" rel="noopener" className="link-chip">
                        <BookOpen size={14} /> Menu
                      </a>
                    )}
                    {restaurant.google_url && (
                      <a href={restaurant.google_url} target="_blank" rel="noopener" className="link-chip">
                        <ExternalLink size={14} /> Google
                      </a>
                    )}
                    {restaurant.yelp_url && (
                      <a href={restaurant.yelp_url} target="_blank" rel="noopener" className="link-chip">
                        <ExternalLink size={14} /> Yelp
                      </a>
                    )}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 20, color: 'var(--hot-pink)' }}>
            Dishes ({dishes.length})
          </h2>
          {dishes.length > 0 && (
            <button
              onClick={() => {
                if (dishSelectionMode) exitDishSelectionMode();
                else setDishSelectionMode(true);
              }}
              style={{ background: 'none', border: 'none', color: dishSelectionMode ? 'var(--electric-blue)' : 'var(--text-muted)', padding: 4 }}
            >
              <CheckSquare size={18} />
            </button>
          )}
        </div>

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
          groupedDishes.map((group) => (
            <div key={group.label} style={{ marginBottom: 12 }}>
              <button
                className="collapsible-header"
                onClick={() => toggleSection(group.label)}
              >
                <h3>
                  {group.label} ({group.dishes.length})
                </h3>
                {collapsedSections.has(group.label) ? (
                  <ChevronDown size={18} color="var(--text-muted)" />
                ) : (
                  <ChevronUp size={18} color="var(--text-muted)" />
                )}
              </button>
              {!collapsedSections.has(group.label) &&
                group.dishes.map((dish) => (
                  <DishCard
                    key={dish.id}
                    dish={dish}
                    onDelete={dishSelectionMode ? undefined : () => handleDeleteDish(dish.id)}
                    onEdit={dishSelectionMode ? undefined : () => navigate(`/restaurant/${id}/dish/${dish.id}/edit`)}
                    selectionMode={dishSelectionMode}
                    selected={selectedDishIds.has(dish.id)}
                    onToggleSelect={() => toggleDishSelect(dish.id)}
                  />
                ))}
            </div>
          ))
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
    </div>
  );
}
