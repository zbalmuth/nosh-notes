import { useContext } from 'react';
import { AppLockContext } from '../lib/appLockContext';

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}
