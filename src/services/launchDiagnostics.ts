import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'listorix:launchDiagnostics';
const MAX_ENTRIES = 40;

export interface LaunchDiagnosticEntry {
  ts: number;
  stage: string;
  detail?: string;
}

let installDone = false;

function formatDetail(detail?: string): string | undefined {
  if (!detail) return undefined;
  return detail.length > 220 ? `${detail.slice(0, 217)}...` : detail;
}

export async function beginLaunchDiagnosticsSession(reason = 'app_launch'): Promise<void> {
  const initial: LaunchDiagnosticEntry[] = [{
    ts: Date.now(),
    stage: 'session_start',
    detail: reason,
  }];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(initial));
  } catch {
    // Diagnostics should never break app launch.
  }
}

export async function appendLaunchDiagnostic(stage: string, detail?: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const current: LaunchDiagnosticEntry[] = raw ? JSON.parse(raw) : [];
    const next = [
      ...current,
      { ts: Date.now(), stage, detail: formatDetail(detail) },
    ].slice(-MAX_ENTRIES);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Diagnostics should never break app launch.
  }
}

export async function getLaunchDiagnostics(): Promise<LaunchDiagnosticEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearLaunchDiagnostics(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Diagnostics should never break app launch.
  }
}

export function installLaunchErrorHandler(): void {
  if (installDone) return;
  installDone = true;

  const ErrorUtilsRef = (globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;

  const previousHandler = ErrorUtilsRef?.getGlobalHandler?.();
  if (!ErrorUtilsRef?.setGlobalHandler) return;

  ErrorUtilsRef.setGlobalHandler((error, isFatal) => {
    appendLaunchDiagnostic(
      isFatal ? 'fatal_error' : 'error',
      `${error?.name ?? 'Error'}: ${error?.message ?? 'Unknown error'}`
    ).catch(() => undefined);

    previousHandler?.(error, isFatal);
  });
}

export function formatLaunchDiagnostics(entries: LaunchDiagnosticEntry[]): string {
  if (entries.length === 0) return 'No launch diagnostics recorded yet.';

  return entries
    .map((entry) => {
      const time = new Date(entry.ts).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return entry.detail
        ? `${time}  ${entry.stage}  ${entry.detail}`
        : `${time}  ${entry.stage}`;
    })
    .join('\n');
}
