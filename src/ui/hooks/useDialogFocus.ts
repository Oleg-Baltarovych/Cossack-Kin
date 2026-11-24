// Focus around a modal window (plan M2-25, WAI-ARIA dialog): while `open`, the rest of the UI is inert (GameUi) and
// the window takes the focus itself; when the last window closes, the focus goes back to where it was before the first
// one opened — the button that bought the beat's building, say — if that element is still in the page; if the window's
// own action took it away (the raid map's «Вирушити» turns «Обрати похід» into a slot on the road), to the nearest
// ancestor that takes the focus (the «Походи» block), never to the page's body.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';

/** What Tab reaches: a roving group's other members (tabindex -1) are left out like disabled buttons. */
const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab stay inside `box`: from the last control to the first and back. */
export function trapTab(e: KeyboardEvent<HTMLElement>, box: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const edge = e.shiftKey ? first : last;
  if (document.activeElement === edge || !box.contains(document.activeElement)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

/** The ancestors of `el`, nearest first. */
function ancestors(el: Element | null): Element[] {
  const up: Element[] = [];
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) up.push(p);
  return up;
}

export function useDialogFocus(open: boolean): void {
  const opener = useRef<Element | null>(null);
  // The opener's ancestors when the window opened: a removed element has no parent left to walk up from.
  const around = useRef<readonly Element[]>([]);
  // The press that opens a window may remove its own button in the same render (a raid's «Забрати» turns the card
  // idle and opens the chest, M3-12), so by the time the window opens the focus is already on the body. The element
  // pressed is kept only for the rest of that press's task: a window that opens later on its own (a story beat from a
  // tick) must not send the focus to the surroundings of some button that went away long before.
  const pressed = useRef<{ el: Element; up: readonly Element[] } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (e: MouseEvent): void => {
      if (!(e.target instanceof Element)) return;
      pressed.current = { el: e.target, up: ancestors(e.target) };
      clearTimeout(timer);
      timer = setTimeout(() => {
        pressed.current = null;
      }, 0);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clearTimeout(timer);
    };
  }, []);
  // A layout effect: it runs after React set `inert`, before the browser's focus fix-up moves the focus away (that
  // waits for the next rendering update), and before the window's own passive effect focuses its button.
  useLayoutEffect(() => {
    if (!open || opener.current !== null) return;
    const active = document.activeElement;
    const lost = pressed.current;
    pressed.current = null;
    if ((active === null || active === document.body) && lost && !lost.el.isConnected) {
      opener.current = lost.el;
      around.current = lost.up;
      return;
    }
    opener.current = active;
    around.current = ancestors(active);
  }, [open]);
  // Passive: by now `inert` is gone from the rest of the UI, so the old element can take the focus again.
  useEffect(() => {
    if (open) return;
    const el = opener.current;
    const up = around.current;
    opener.current = null;
    around.current = [];
    if (el instanceof HTMLElement && el.isConnected && el !== document.body) {
      el.focus();
      return;
    }
    if (el === null || el === document.body) return;
    const near = up.find((p) => p.isConnected && p.matches('[tabindex]'));
    if (near instanceof HTMLElement) near.focus({ preventScroll: true });
  }, [open]);
}
