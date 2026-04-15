/**
 * Tiny event bus so any screen can ask the layout-level FAB to open.
 * Only one listener at a time (the FAB in _layout.tsx).
 */
type Listener = () => void;
let _listener: Listener | null = null;

export const fabEvents = {
  setListener: (fn: Listener) => { _listener = fn; },
  removeListener: () => { _listener = null; },
  openFAB: () => { _listener?.(); },
};
