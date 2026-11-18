// One game per browser (platform review M1-18, M4): two tabs on the same save would each credit their own return and
// overwrite each other's slots. The first tab holds a Web Lock for its lifetime; a second tab finds it taken and does
// not start the game. Without the Locks API (old WebViews) the game runs — Capacitor is a single instance anyway.
const LOCK = 'cossack-kin-game';

export type TabClaim = 'owner' | 'elsewhere';

/** The Locks API where the browser has it (typed as always there; old WebViews lack it). */
function browserLocks(): LockManager | null {
  return 'locks' in navigator ? navigator.locks : null;
}

export function claimTab(locks: LockManager | null = browserLocks()): Promise<TabClaim> {
  if (!locks) return Promise.resolve('owner');
  return new Promise((resolve) => {
    locks
      .request(LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve('elsewhere');
          return undefined;
        }
        resolve('owner');
        // Held until the page goes away: the callback's promise never settles.
        return new Promise<never>(() => undefined);
      })
      .catch(() => {
        resolve('owner');
      });
  });
}
