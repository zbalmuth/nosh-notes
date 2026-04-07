import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Monotonically increasing ID so concurrent notifications don't collide.
let _nextId = 1;

/**
 * Request notification permission.
 * - Native (iOS): uses LocalNotifications.requestPermissions() — fires even when
 *   the app is backgrounded or the phone is locked.
 * - Browser: falls back to the web Notification API.
 */
export async function requestNotificationPermission(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.requestPermissions();
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch {
    // Permission prompt suppressed or unavailable — silently ignore.
  }
}

/**
 * Fire a notification.
 * - Native: schedules an immediate LocalNotification (works backgrounded/locked).
 * - Browser: creates a web Notification if permission is granted.
 */
export async function sendNotification(title: string, body: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { display } = await LocalNotifications.checkPermissions();
      if (display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [{ id: _nextId++, title, body }],
        });
      }
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  } catch {
    // Never crash the caller over a notification failure.
  }
}
