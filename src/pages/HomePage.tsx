import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Star,
  Filter,
  ChevronDown,
  X,
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
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');

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

  const currentListLabel = selectedList === 'all' ? 'All Restaurants' : selectedList;

  if (loading) {
    return <div className="loading-spinner" style={{ marginTop: 60 }} />;
  }

  return (
    <div>
      {/* Header with list selector */}
      <div className="page-header">
        <div style={{ flex: 1, position: 'relative' }}>
          <button
            onClick={() => setShowListDropdown(!showListDropdown)}
            style={{
              background: 'none', border: 'none', padding: 0,
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            }}
          >
            <h1 style={{ fontSize: 20 }}>{currentListLabel}</h1>
            <ChevronDown size={18} color="var(--hot-pink)" />
          </button>

          {/* List dropdown */}
          {showListDropdown && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 149 }}
                onClick={() => setShowListDropdown(false)}
              />
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0,
                  marginTop: 8, zIndex: 150,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', minWidth: 220,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                  overflow: 'hidden',
                }}
              >
                {/* All Restaurants */}
                <button
                  onClick={() => { setSelectedList('all'); setShowListDropdown(false); }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 16px',
                    background: selectedList === 'all' ? 'var(--bg-secondary)' : 'none',
                    border: 'none', color: 'var(--text-primary)', fontSize: 14,
                    fontWeight: selectedList === 'all' ? 600 : 400,
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  All Restaurants
                </button>

                {/* Each list */}
                {lists.map((list) => (
                  <div
                    key={list.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: '1px solid var(--border)',
                      background: selectedList === list.name ? 'var(--bg-secondary)' : 'none',
                    }}
                  >
                    <button
                      onClick={() => { setSelectedList(list.name); setShowListDropdown(false); }}
                      style={{
                        flex: 1, textAlign: 'left', padding: '12px 16px',
                        background: 'none', border: 'none', color: 'var(--text-primary)',
                        fontSize: 14, fontWeight: selectedList === list.name ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {list.name}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete list "${list.name}"?`)) {
                          deleteList(list.id);
                          if (selectedList === list.name) setSelectedList('all');
                        }
                      }}
                      style={{
                        background: 'none', border: 'none', padding: '8px 12px',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {/* Create new list */}
                {showNewList ? (
                  <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      placeholder="List name..."
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                      autoFocus
                      style={{ fontSize: 13, padding: '8px 12px' }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ padding: '8px 12px', fontSize: 13 }}
                      onClick={handleCreateList}
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewList(true)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '12px 16px',
                      background: 'none', border: 'none',
                      color: 'var(--electric-blue)', fontSize: 14,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Plus size={14} />
                    New List
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setShowSearch(!showSearch)}
          style={{ background: 'none', border: 'none', color: 'var(--hot-pink)' }}
        >
          {showSearch ? <X size={22} /> : <Search size={22} />}
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
          <Star size={12} fill={favoritesOnly ? 'var(--white)' : 'none'} />
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
                  <option key={c} value={c}>{c}</option>
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
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {(selectedCity !== 'all' || selectedCuisine !== 'all') && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 13, padding: '8px 16px' }}
              onClick={() => {
                setSelectedCity('all');
                setSelectedCuisine('all');
              }}
            >
              Clear Filters
            </button>
          )}
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
