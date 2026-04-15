import { useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Returns true when the device appears to have internet connectivity.
 * Uses a lightweight fetch ping so no extra packages are needed.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  async function check() {
    try {
      await fetch('https://www.google.com', {
        method:  'HEAD',
        cache:   'no-cache',
        headers: { 'Cache-Control': 'no-cache' },
      });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }

  useEffect(() => {
    check();

    // Re-check when app comes to foreground
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });

    return () => sub.remove();
  }, []);

  return isOnline;
}
