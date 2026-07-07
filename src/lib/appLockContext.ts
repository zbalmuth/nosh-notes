import { createContext } from 'react';
import type { BiometryType } from '@aparajita/capacitor-biometric-auth';

export interface AppLockContextValue {
  needsUnlock: boolean;
  isNative: boolean;
  isAvailable: boolean;
  biometryType: BiometryType;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  unlock: () => Promise<boolean>;
  markUnlocked: () => void;
}

export const AppLockContext = createContext<AppLockContextValue | null>(null);
