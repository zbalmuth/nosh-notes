import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';

const STORAGE_KEY = 'nosh-faceid-enabled';

export function useBiometricLock() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState<BiometryType>(BiometryType.none);
  const [enabled, setEnabledState] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    BiometricAuth.checkBiometry()
      .then((result) => {
        setIsAvailable(result.isAvailable);
        setBiometryType(result.biometryType);
      })
      .catch(() => setIsAvailable(false));
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    setEnabledState(value);
  }, []);

  const unlock = useCallback(async (): Promise<boolean> => {
    try {
      await BiometricAuth.authenticate({
        reason: 'Unlock Nosh Notes',
        cancelTitle: 'Cancel',
        allowDeviceCredential: true,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  return { isAvailable, biometryType, enabled, setEnabled, unlock, isNative: Capacitor.isNativePlatform() };
}
