// Tap coins (plan M1-19, SPEC §6.7): a ducat pops where the world was tapped, rises, spins and fades. Pure cosmetics:
// spawned by render/bridge.ts on the core's `Tapped` event, never by the tap itself (a refused tap shows nothing).
// Times are real seconds (not the frozen/ambient clock), so a coin always finishes; «менше руху» keeps it still and
// short. Pooled, counted in the particle registry.
import { Container, Sprite, type Texture } from 'pixi.js';
import { COIN } from '../atmosphere/config.ts';
import { claimParticles } from './registry.ts';

export interface CoinFx {
  readonly container: Container;
  /** A coin at world px (ground space) `x`, `y`, born at `now` (s). */
  spawn(x: number, y: number, now: number): void;
  update(now: number): void;
  destroy(): void;
}

interface Live {
  readonly sprite: Sprite;
  x: number;
  y: number;
  born: number;
}

export function createCoinFx(frames: readonly Texture[], lessMotion: boolean): CoinFx {
  const first = frames[0];
  if (!first) throw new Error('coins: no coin frames');
  const container = new Container({ label: 'coins' });
  const claim = claimParticles();
  const pool: Live[] = Array.from({ length: COIN.max }, () => {
    const sprite = new Sprite({ texture: first, roundPixels: true });
    sprite.anchor.set(0.5);
    sprite.visible = false;
    container.addChild(sprite);
    return { sprite, x: 0, y: 0, born: -Infinity };
  });
  const life = lessMotion ? COIN.stillLife : COIN.life;
  const alive = (c: Live, now: number): boolean => now - c.born < life;

  return {
    container,
    spawn(x, y, now) {
      // The oldest coin makes room when every one is in the air.
      const slot = pool.reduce((a, b) => (b.born < a.born ? b : a));
      slot.x = Math.round(x);
      slot.y = Math.round(y);
      slot.born = now;
    },
    update(now) {
      let live = 0;
      for (const c of pool) {
        if (!alive(c, now)) {
          c.sprite.visible = false;
          continue;
        }
        live += 1;
        const t = (now - c.born) / life;
        // Ease-out rise in whole px; the spin steps through the 4 frames.
        const rise = lessMotion ? 0 : Math.round(COIN.rise * (1 - (1 - t) * (1 - t)));
        const frame = lessMotion ? 0 : Math.floor((now - c.born) * COIN.spinFps) % frames.length;
        c.sprite.texture = frames[frame] ?? c.sprite.texture;
        c.sprite.position.set(c.x, c.y - rise);
        // Fades in whole quarters over the last part of its life (no sub-step alpha shimmer).
        const fade = t < COIN.fadeFrom ? 1 : 1 - (t - COIN.fadeFrom) / (1 - COIN.fadeFrom);
        c.sprite.alpha = Math.max(0, Math.round(fade * 4) / 4);
        c.sprite.visible = c.sprite.alpha > 0;
      }
      claim.set(live);
    },
    destroy() {
      claim.release();
      container.destroy({ children: true });
    },
  };
}
