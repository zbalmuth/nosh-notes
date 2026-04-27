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
import { applyTheme, getTheme, loadThemeFromServer } from './pages/SettingsPage';

// Apply locally saved theme immediately (no flash)
applyTheme(getTheme());

const NAV_ROUTES = ['/', '/map', '/search', '/settings'];

// Saves the current nav tab to localStorage whenever it changes
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (NAV_ROUTES.includes(location.pathname)) {
      localStorage.setItem('nosh-last-route', location.pathname);
    }
  }, [location.pathname]);
  return null;
}

// On first mount, navigates to the last saved tab (runs inside BrowserRouter via useEffect,
// so it happens after the first render and avoids any WebView URL side-effects during render)
function InitialRedirect() {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const saved = localStorage.getItem('nosh-last-route');
    if (saved && saved !== '/') {
      navigate(saved, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (!session) {
    return <AuthPage />;
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

export default App;
