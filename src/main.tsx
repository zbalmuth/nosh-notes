import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// The installed web app opens from its cached copy. Without this, a new
// version only showed up after a second cold launch, and returning to the app
// from another one never counted as one, so phones sat on old versions for
// days. Now: check for a new version on launch and whenever the app comes back
// to the foreground, and reload into it as soon as it's downloaded.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => { registration.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 30 * 60 * 1000);
  },
});
void updateSW;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
