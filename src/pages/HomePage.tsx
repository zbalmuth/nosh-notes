import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Star,
  Filter,
  ChevronDown,
  X,
  Trash2,
  CheckSquare,
  Copy,
  ArrowRight,
  Share2,
} from 'lucide-react';
import { useApp } from '../hooks/useAppContext';
import { RestaurantCard } from '../components/RestaurantCard';

const FILTERS_KEY = 'nosh-notes-filters';

function loadSavedFilters() {
  try {
    const saved = localStorage.getItem(FILTERS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

function saveFilters(filters: Record<string, unknown>) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {}
}

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
    updateRestaurant,
    deleteRestaurant,
    getDishes,
    showToast,
    refreshRestaurants,
    refreshLists,
    refreshCuisineTags,
  } = useApp();

  const saved = loadSavedFilters();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(searchParams.get('search') === 'true');
  const [selectedList, setSelectedList] = useState<string>(saved.selectedList || 'all');
  const [selectedCity, setSelectedCity] = useState<string>(saved.selectedCity || 'all');
  const [selectedCuisine, setSelectedCuisine] = useState<string>(saved.selectedCuisine || 'all');
  const [favoritesOnly, setFavoritesOnly] = useState(saved.favoritesOnly || false);
  const [showFilters, setShowFilters] = useState(saved.showFilters || false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Persist filter state to localStorage
  useEffect(() => {
    saveFilters({ selectedList, selectedCity, selectedCuisine, favoritesOnly, showFilters });
  }, [selectedList, selectedCity, selectedCuisine, favoritesOnly, showFilters]);

  // React to search param changes (e.g. clicking Search in bottom nav while already on /)
  useEffect(() => {
    if (searchParams.get('search') === 'true') {
      setShowSearch(true);
    }
  }, [searchParams]);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshRestaurants(), refreshLists(), refreshCuisineTags()]);
    setRefreshing(false);
    showToast('Refreshed!');
  }, [refreshRestaurants, refreshLists, refreshCuisineTags, showToast]);

  const handlePullTouchStart = useCallback((e: React.TouchEvent) => {
    // Check if the page-content parent is scrolled to top
    const scrollParent = scrollRef.current?.closest('.page-content');
    if (scrollParent && scrollParent.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handlePullTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.4, 80));
    }
  }, []);

  const handlePullTouchEnd = useCallback(() => {
    if (pullDistance > 50) {
      handleRefresh();
    }
    setPullDistance(0);
    isPulling.current = false;
  }, [pullDistance, handleRefresh]);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveToList, setShowMoveToList] = useState(false);
  const [moveAction, setMoveAction] = useState<'copy' | 'move'>('copy');
  const [showNewListInMove, setShowNewListInMove] = useState(false);
  const [newListInMoveName, setNewListInMoveName] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setShowMoveToList(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} restaurant${selectedIds.size > 1 ? 's' : ''}?`)) return;
    for (const id of selectedIds) {
      await deleteRestaurant(id);
    }
    showToast(`${selectedIds.size} restaurant${selectedIds.size > 1 ? 's' : ''} deleted`);
    exitSelectionMode();
  };

  const handleBulkListAction = async (targetList: string) => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      const r = restaurants.find((r) => r.id === id);
      if (!r) continue;
      const currentLists = r.lists || [];
      if (moveAction === 'copy') {
        if (!currentLists.includes(targetList)) {
          await updateRestaurant(id, { lists: [...currentLists, targetList] });
        }
      } else {
        // Move — replace lists with just the target
        await updateRestaurant(id, { lists: [targetList] });
      }
    }
    showToast(`${selectedIds.size} restaurant${selectedIds.size > 1 ? 's' : ''} ${moveAction === 'copy' ? 'copied' : 'moved'} to "${targetList}"`);
    setShowMoveToList(false);
    exitSelectionMode();
  };

  const handleShare = async () => {
    if (selectedIds.size === 0) return;
    const selected = restaurants.filter((r) => selectedIds.has(r.id));

    const parts: string[] = [];
    for (const r of selected) {
      let section = `${r.name}`;
      if (r.city) section += ` — ${r.city}${r.state ? `, ${r.state}` : ''}`;
      if (r.cuisine_tags?.length) section += ` (${r.cuisine_tags.join(', ')})`;
      if (r.address) section += `\n  ${r.address}`;
      if (r.phone) section += `\n  ${r.phone}`;
      if (r.website) section += `\n  ${r.website}`;

      // Include dishes
      try {
        const dishes = await getDishes(r.id);
        if (dishes.length > 0) {
          section += '\n  Dishes:';
          for (const d of dishes) {
            let dishLine = `\n    • ${d.name}`;
            if (d.want_to_try) {
              dishLine += ' (Want to Try)';
            } else if (d.rating !== null) {
              dishLine += ` — ${d.rating.toFixed(1)}/10`;
            }
            if (d.notes) dishLine += ` — "${d.notes}"`;
            section += dishLine;
          }
        }
      } catch {}

      parts.push(section);
    }

    const text = parts.join('\n\n');

    if (navigator.share) {
      navigator.share({ title: 'My Restaurants', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
    }
    exitSelectionMode();
  };

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
    <div
      ref={scrollRef}
      onTouchStart={handlePullTouchStart}
      onTouchMove={handlePullTouchMove}
      onTouchEnd={handlePullTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: refreshing ? 40 : pullDistance,
          overflow: 'hidden', transition: refreshing ? 'height 0.2s' : 'none',
        }}>
          {refreshing ? (
            <div className="loading-spinner" style={{ width: 24, height: 24 }} />
          ) : (
            <span style={{
              fontSize: 12, color: 'var(--text-muted)',
              opacity: pullDistance > 50 ? 1 : pullDistance / 50,
            }}>
              {pullDistance > 50 ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          )}
        </div>
      )}

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
          onClick={() => {
            if (selectionMode) {
              exitSelectionMode();
            } else {
              setSelectionMode(true);
            }
          }}
          style={{ background: 'none', border: 'none', color: selectionMode ? 'var(--electric-blue)' : 'var(--text-muted)', padding: 4 }}
        >
          <CheckSquare size={20} />
        </button>
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

      {/* Selection action bar */}
      {selectionMode && (
        <div style={{
          padding: '10px 20px',
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <button
            className={`chip ${selectedIds.size === filtered.length && filtered.length > 0 ? 'active' : ''}`}
            onClick={toggleSelectAll}
            style={{ fontSize: 12 }}
          >
            {selectedIds.size === filtered.length && filtered.length > 0 ? 'Unselect All' : 'Select All'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {selectedIds.size} selected
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setMoveAction('copy'); setShowMoveToList(true); }}
            disabled={selectedIds.size === 0}
            style={{ background: 'none', border: 'none', color: selectedIds.size > 0 ? 'var(--electric-blue)' : 'var(--text-muted)', padding: 6 }}
            title="Copy to list"
          >
            <Copy size={18} />
          </button>
          <button
            onClick={() => { setMoveAction('move'); setShowMoveToList(true); }}
            disabled={selectedIds.size === 0}
            style={{ background: 'none', border: 'none', color: selectedIds.size > 0 ? 'var(--cyan)' : 'var(--text-muted)', padding: 6 }}
            title="Move to list"
          >
            <ArrowRight size={18} />
          </button>
          <button
            onClick={handleShare}
            disabled={selectedIds.size === 0}
            style={{ background: 'none', border: 'none', color: selectedIds.size > 0 ? 'var(--palm-green)' : 'var(--text-muted)', padding: 6 }}
            title="Share"
          >
            <Share2 size={18} />
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0}
            style={{ background: 'none', border: 'none', color: selectedIds.size > 0 ? '#FF1744' : 'var(--text-muted)', padding: 6 }}
            title="Delete"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}

      {/* Move/Copy to list picker */}
      {showMoveToList && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }}
            onClick={() => setShowMoveToList(false)}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
            background: 'var(--bg-card)', borderTop: '2px solid var(--hot-pink)',
            borderRadius: '16px 16px 0 0',
            padding: '20px 20px calc(40px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '60vh', overflowY: 'auto',
          }}>
            <h3 style={{ fontFamily: "'Righteous', cursive", fontSize: 16, color: 'var(--hot-pink)', marginBottom: 12 }}>
              {moveAction === 'copy' ? 'Copy' : 'Move'} to List
            </h3>
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => handleBulkListAction(list.name)}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px 16px',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 15, cursor: 'pointer',
                }}
              >
                {list.name}
              </button>
            ))}
            {/* New list inline */}
            {showNewListInMove ? (
              <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="New list name..."
                  value={newListInMoveName}
                  onChange={(e) => setNewListInMoveName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newListInMoveName.trim()) {
                      await addList(newListInMoveName.trim());
                      handleBulkListAction(newListInMoveName.trim());
                      setNewListInMoveName('');
                      setShowNewListInMove(false);
                    }
                  }}
                  autoFocus
                  style={{ fontSize: 13, padding: '8px 12px' }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '8px 12px', fontSize: 13 }}
                  onClick={async () => {
                    if (!newListInMoveName.trim()) return;
                    await addList(newListInMoveName.trim());
                    handleBulkListAction(newListInMoveName.trim());
                    setNewListInMoveName('');
                    setShowNewListInMove(false);
                  }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewListInMove(true)}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px 16px',
                  background: 'none', border: 'none',
                  color: 'var(--electric-blue)', fontSize: 15, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Plus size={14} />
                New List
              </button>
            )}
          </div>
        </>
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
              <RestaurantCard
                key={r.id}
                restaurant={r}
                selectionMode={selectionMode}
                selected={selectedIds.has(r.id)}
                onToggleSelect={() => toggleSelect(r.id)}
              />
            ))}
          </>
        )}
      </div>

      {/* FAB */}
      {!selectionMode && (
        <button className="fab" onClick={() => navigate('/add-restaurant')}>
          <Plus size={28} />
        </button>
      )}
    </div>
  );
}
