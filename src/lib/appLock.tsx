import { useMemo, useState } from 'react';
import { useBiometricLock } from '../hooks/useBiometricLock';
import { AppLockContext, type AppLockContextValue } from './appLockContext';

// Shared between App.tsx (which falls back to AuthPage until unlocked) and
// AuthPage itself (which renders the Face ID panel) so both agree on lock
// state without re-deriving it independently.
export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isNative, isAvailable, biometryType, enabled, setEnabled, unlock } = useBiometricLock();
  const [sessionUnlocked, setSessionUnlocked] = useState(false);
  const needsUnlock = isNative && enabled && !sessionUnlocked;

  const value = useMemo<AppLockContextValue>(() => ({
    needsUnlock,
    isNative,
    isAvailable,
    biometryType,
    enabled,
    setEnabled,
    unlock,
    markUnlocked: () => setSessionUnlocked(true),
  }), [needsUnlock, isNative, isAvailable, biometryType, enabled, setEnabled, unlock]);

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}
