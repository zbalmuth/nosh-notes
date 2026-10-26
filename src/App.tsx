import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { requestNotificationPermission } from './lib/notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { RestaurantPage } from './pages/RestaurantPage';
import { AddRestaurantPage } from './pages/AddRestaurantPage';
import { AddDishPage } from './pages/AddDishPage';
import { EditDishPage } from './pages/EditDishPage';
import { MapPage } from './pages/MapPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { BottomNav } from './components/BottomNav';
import { AppProvider } from './hooks/useAppContext';
import { AppLockProvider } from './lib/appLock';
import { useAppLock } from './hooks/useAppLock';
import { applyTheme, getTheme, loadThemeFromServer } from './pages/SettingsPage';

// Apply locally saved theme immediately (no flash)
applyTheme(getTheme());

const NAV_ROUTES = ['/', '/map', '/search', '/settings'];

// Deep pages (a restaurant, adding a dish) are only worth reopening if you
// were just there; after this long, cold start goes back to your tab.
const DEEP_ROUTE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Saves where you are whenever it changes: the nav tab, plus the exact page.
// iOS can kill the app while it's in the background, and without this coming
// back always dropped you on a tab instead of the page you left.
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (NAV_ROUTES.includes(location.pathname)) {
      localStorage.setItem('nosh-last-route', location.pathname);
    }
    localStorage.setItem(
      'nosh-last-page',
      JSON.stringify({ path: location.pathname + location.search, t: Date.now() }),
    );
  }, [location.pathname, location.search]);
  return null;
}

// The pages Back should lead through from a restored deep page, so the back
// arrow (navigate(-1)) still has somewhere to go.
function parentsOf(path: string): string[] {
  const restaurant = path.match(/^\/restaurant\/[^/?]+/)?.[0];
  return restaurant && restaurant !== path.split('?')[0] ? [restaurant] : [];
}

// On first mount, navigates back to where you were (runs inside BrowserRouter
// via useEffect, so it happens after the first render and avoids any WebView
// URL side-effects during render)
function InitialRedirect() {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const tab = localStorage.getItem('nosh-last-route');
    if (tab && tab !== '/') navigate(tab, { replace: true });

    let page: { path: string; t: number } | null = null;
    try {
      page = JSON.parse(localStorage.getItem('nosh-last-page') ?? 'null');
    } catch {
      // unreadable — just use the tab
    }
    if (!page || Date.now() - page.t > DEEP_ROUTE_MAX_AGE_MS) return;
    if (NAV_ROUTES.includes(page.path.split('?')[0])) {
      // A tab with a query (e.g. /?search=true) — the tab alone is enough.
      return;
    }
    for (const parent of parentsOf(page.path)) navigate(parent);
    navigate(page.path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function AppInner() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { needsUnlock } = useAppLock();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        setSession(refreshed ?? session);
        loadThemeFromServer();
        requestNotificationPermission();
      }
      setLoading(false);
      SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) loadThemeFromServer();
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading-spinner" style={{ flex: 1 }} />
      </div>
    );
  }

  if (!session || needsUnlock) {
    return <AuthPage session={session} />;
  }

  return (
    <AppProvider>
      <BrowserRouter>
        <InitialRedirect />
        <RouteTracker />
        <div className="app-container">
          <div className="page-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/restaurant/:id" element={<RestaurantPage />} />
              <Route path="/add-restaurant" element={<AddRestaurantPage />} />
              <Route path="/restaurant/:restaurantId/add-dish" element={<AddDishPage />} />
              <Route path="/restaurant/:restaurantId/dish/:dishId/edit" element={<EditDishPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          <BottomNav />
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}

function App() {
  return (
    <AppLockProvider>
      <AppInner />
    </AppLockProvider>
  );
}

export default App;
