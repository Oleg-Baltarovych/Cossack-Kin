// «Менше руху» for DOM code that decides in script whether to move at all (plan M2-25 coins): the game's own setting
// (`html[data-motion=reduced]`, main.tsx) or the system's prefers-reduced-motion. CSS keys off the same two.
export function lessMotion(doc: Document = document): boolean {
  if (doc.documentElement.dataset['motion'] === 'reduced') return true;
  const view = doc.defaultView;
  return typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
