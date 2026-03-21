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
  } = useApp();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

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
    // Also add unrated dishes that aren't want_to_try
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

  if (!restaurant) {
    return <div className="loading-spinner" style={{ marginTop: 60 }} />;
  }

  return (
    <div>
      {/* Hero */}
      <div className="restaurant-hero">
        {restaurant.image_url ? (
          <img src={restaurant.image_url} alt={restaurant.name} />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, var(--burnt-orange), var(--mustard), var(--avocado))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 60,
          }}>
            🍽️
          </div>
        )}
        <div className="hero-overlay">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', color: 'var(--cream)', padding: 0 }}
            >
              <ArrowLeft size={24} />
            </button>
            <h1 style={{ flex: 1 }}>{restaurant.name}</h1>
            <button
              className={`favorite-btn ${restaurant.is_favorite ? 'active' : ''}`}
              onClick={() => toggleFavorite(restaurant.id, !restaurant.is_favorite)}
              style={{ color: restaurant.is_favorite ? 'var(--mustard)' : 'var(--cream)' }}
            >
              <Star size={24} fill={restaurant.is_favorite ? 'var(--mustard)' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '16px 20px' }}>
        {/* Address */}
        <div className="info-row">
          <MapPin size={16} />
          <span>{restaurant.address}, {restaurant.city}{restaurant.state ? `, ${restaurant.state}` : ''}</span>
        </div>

        {restaurant.phone && (
          <div className="info-row">
            <Phone size={16} />
            <a href={`tel:${restaurant.phone}`} style={{ color: 'var(--burnt-orange)' }}>
              {restaurant.phone}
            </a>
          </div>
        )}

        {/* Price & External Rating */}
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {restaurant.price_level && (
            <span style={{
              fontFamily: "'Righteous', cursive",
              color: 'var(--avocado)',
              fontSize: 16,
            }}>
              {restaurant.price_level}
            </span>
          )}
          {restaurant.external_rating && (
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              ⭐ {restaurant.external_rating}
            </span>
          )}
        </div>

        {/* Cuisine Tags */}
        {restaurant.cuisine_tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {restaurant.cuisine_tags.map((tag) => (
              <span key={tag} className="chip">
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Links */}
        <div className="links-row" style={{ marginTop: 12 }}>
          {restaurant.website && (
            <a href={restaurant.website} target="_blank" rel="noopener" className="link-chip">
              <Globe size={14} /> Website
            </a>
          )}
          {restaurant.yelp_url && (
            <a href={restaurant.yelp_url} target="_blank" rel="noopener" className="link-chip">
              <ExternalLink size={14} /> Yelp
            </a>
          )}
          {restaurant.google_url && (
            <a href={restaurant.google_url} target="_blank" rel="noopener" className="link-chip">
              <ExternalLink size={14} /> Google
            </a>
          )}
          {restaurant.menu_url && (
            <a href={restaurant.menu_url} target="_blank" rel="noopener" className="link-chip">
              <ExternalLink size={14} /> Menu
            </a>
          )}
        </div>

        {/* Photos */}
        {restaurant.photos?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, color: 'var(--burnt-orange)', marginBottom: 8, fontFamily: "'Righteous', cursive" }}>
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
          <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 20, color: 'var(--burnt-orange)' }}>
            Dishes ({dishes.length})
          </h2>
        </div>

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
                    onDelete={() => handleDeleteDish(dish.id)}
                  />
                ))}
            </div>
          ))
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, marginBottom: 80 }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => {
              if (confirm(`Delete "${restaurant.name}"?`)) {
                deleteRestaurant(restaurant.id);
                navigate('/');
              }
            }}
          >
            <Trash2 size={14} />
            Delete
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
