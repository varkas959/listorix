/**
 * Tiny event bus so any screen can ask the layout-level FAB to open.
 * Only one listener at a time (the FAB in _layout.tsx).
 */
type Listener = () => void;
let _fabListener: Listener | null = null;
let _manualListener: Listener | null = null;

export const fabEvents = {
  setFabListener: (fn: Listener) => { _fabListener = fn; },
  removeFabListener: () => { _fabListener = null; },
  openFAB: () => { _fabListener?.(); },
  setManualListener: (fn: Listener) => { _manualListener = fn; },
  removeManualListener: () => { _manualListener = null; },
  openManual: () => { _manualListener?.(); },
};
