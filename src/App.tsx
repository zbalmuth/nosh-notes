import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { RestaurantPage } from './pages/RestaurantPage';
import { AddRestaurantPage } from './pages/AddRestaurantPage';
import { AddDishPage } from './pages/AddDishPage';
import { EditDishPage } from './pages/EditDishPage';
import { MapPage } from './pages/MapPage';
import { SettingsPage } from './pages/SettingsPage';
import { BottomNav } from './components/BottomNav';
import { AppProvider } from './hooks/useAppContext';
import { applyTheme, getTheme } from './pages/SettingsPage';

// Apply saved theme on load
applyTheme(getTheme());

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
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
        <div className="app-container">
          <div className="page-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/restaurant/:id" element={<RestaurantPage />} />
              <Route path="/add-restaurant" element={<AddRestaurantPage />} />
              <Route path="/restaurant/:restaurantId/add-dish" element={<AddDishPage />} />
              <Route path="/restaurant/:restaurantId/dish/:dishId/edit" element={<EditDishPage />} />
              <Route path="/map" element={<MapPage />} />
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
