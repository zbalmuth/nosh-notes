import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Star,
  Filter,
  ChevronDown,
  X,
  List,
  Trash2,
} from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RestaurantCard } from '../components/RestaurantCard';

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    restaurants,
    lists,
    cuisineTags,
    cities,
    loading,
    addList,
    deleteList,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(searchParams.get('search') === 'true');
  const [selectedList, setSelectedList] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedCuisine, setSelectedCuisine] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showListManager, setShowListManager] = useState(false);

  const filtered = useMemo(() => {
    let result = restaurants;

    if (favoritesOnly) {
      result = result.filter((r) => r.is_favorite);
    }
    if (selectedList !== 'all') {
      result = result.filter((r) => r.lists?.includes(selectedList));
    }
    if (selectedCity !== 'all') {
      result = result.filter((r) => r.city === selectedCity);
    }
    if (selectedCuisine !== 'all') {
      result = result.filter((r) => r.cuisine_tags?.includes(selectedCuisine));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q) ||
          r.cuisine_tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [restaurants, favoritesOnly, selectedList, selectedCity, selectedCuisine, searchQuery]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    await addList(newListName.trim());
    setNewListName('');
    setShowNewList(false);
  };

  if (loading) {
    return <div className="loading-spinner" style={{ marginTop: 60 }} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 style={{ flex: 1 }}>🍽️ Nosh Notes</h1>
        <button
          onClick={() => setShowSearch(!showSearch)}
          style={{ background: 'none', border: 'none', color: 'var(--burnt-orange)' }}
        >
          {showSearch ? <X size={22} /> : <Search size={22} />}
        </button>
        <button
          onClick={() => setShowListManager(!showListManager)}
          style={{ background: 'none', border: 'none', color: 'var(--burnt-orange)' }}
        >
          <List size={22} />
        </button>
      </div>

      {/* Search */}
      {showSearch && (
        <div style={{ padding: '12px 0' }}>
          <div className="search-bar">
            <Search size={18} color="var(--text-muted)" />
            <input
              placeholder="Search restaurants, cities, dishes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className={`chip ${favoritesOnly ? 'active' : ''}`}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Star size={12} fill={favoritesOnly ? 'var(--cream)' : 'none'} />
          Favorites
        </button>
        <button
          className={`chip ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={12} />
          Filters
          <ChevronDown size={12} />
        </button>
      </div>

      {showFilters && (
        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* List filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>List</label>
            <div className="select-wrapper">
              <select
                value={selectedList}
                onChange={(e) => setSelectedList(e.target.value)}
              >
                <option value="all">All Lists</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* City filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>City</label>
            <div className="select-wrapper">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <option value="all">All Cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cuisine filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Cuisine</label>
            <div className="select-wrapper">
              <select
                value={selectedCuisine}
                onChange={(e) => setSelectedCuisine(e.target.value)}
              >
                <option value="all">All Cuisines</option>
                {cuisineTags.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(selectedList !== 'all' || selectedCity !== 'all' || selectedCuisine !== 'all') && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 13, padding: '8px 16px' }}
              onClick={() => {
                setSelectedList('all');
                setSelectedCity('all');
                setSelectedCuisine('all');
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* List Manager Modal */}
      {showListManager && (
        <div className="dialog-overlay" onClick={() => setShowListManager(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Righteous', cursive", fontSize: 20, color: 'var(--burnt-orange)' }}>
                My Lists
              </h2>
              <button onClick={() => setShowListManager(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}>
                <X size={24} />
              </button>
            </div>

            {lists.map((list) => (
              <div
                key={list.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ fontWeight: 500 }}>{list.name}</span>
                <button
                  onClick={() => {
                    if (confirm(`Delete list "${list.name}"?`)) deleteList(list.id);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            {showNewList ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  className="input"
                  placeholder="List name..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                  autoFocus
                />
                <button className="btn btn-primary" onClick={handleCreateList}>
                  Add
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: 12 }}
                onClick={() => setShowNewList(true)}
              >
                <Plus size={16} />
                New List
              </button>
            )}
          </div>
        </div>
      )}

      {/* Restaurant List */}
      <div style={{ padding: '12px 20px 100px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No restaurants yet</h3>
            <p>Tap the + button to add your first restaurant</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {filtered.length} restaurant{filtered.length !== 1 ? 's' : ''}
            </p>
            {filtered.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </>
        )}
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => navigate('/add-restaurant')}>
        <Plus size={28} />
      </button>
    </div>
  );
}
