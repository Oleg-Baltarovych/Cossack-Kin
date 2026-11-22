// Focus around a modal window (plan M2-25, WAI-ARIA dialog): while `open`, the rest of the UI is inert (GameUi) and
// the window takes the focus itself; when the last window closes, the focus goes back to where it was before the first
// one opened — the button that bought the beat's building, say — if that element is still in the page.
import { useEffect, useLayoutEffect, useRef } from 'react';

export function useDialogFocus(open: boolean): void {
  const opener = useRef<Element | null>(null);
  // A layout effect: it runs after React set `inert`, before the browser's focus fix-up moves the focus away (that
  // waits for the next rendering update), and before the window's own passive effect focuses its button.
  useLayoutEffect(() => {
    if (open && opener.current === null) opener.current = document.activeElement;
  }, [open]);
  // Passive: by now `inert` is gone from the rest of the UI, so the old element can take the focus again.
  useEffect(() => {
    if (open) return;
    const el = opener.current;
    opener.current = null;
    if (el instanceof HTMLElement && el.isConnected && el !== document.body) el.focus();
  }, [open]);
}
