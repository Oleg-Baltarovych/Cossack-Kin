// «Менше руху» for DOM code that decides in script whether to move at all (plan M2-25 coins, M2-26 counters): the
// game's own setting (`html[data-motion=reduced]`, main.tsx) or the system's prefers-reduced-motion. CSS keys off the
// same two. The media query list is made once per window and read live (`matches`), so a call per tick allocates
// nothing; the game's own switch is read from the dataset every time.
const QUERY = '(prefers-reduced-motion: reduce)';
let cached: { readonly view: Window; readonly list: MediaQueryList | null } | null = null;

export function lessMotion(doc: Document = document): boolean {
  if (doc.documentElement.dataset['motion'] === 'reduced') return true;
  const view = doc.defaultView;
  if (!view) return false;
  if (cached?.view !== view)
    cached = { view, list: typeof view.matchMedia === 'function' ? view.matchMedia(QUERY) : null };
  return cached.list?.matches ?? false;
}
