// Global particle counter (plan M0-06, budget SPEC §12.4: ≤ 300). Every emitter acquires on spawn and
// releases on death/destroy, so the debug overlay and window.__CK__.stats show the live total.

export const PARTICLE_BUDGET = 300;

export class ParticleRegistry {
  #active = 0;

  get active(): number {
    return this.#active;
  }

  acquire(count: number): void {
    if (Number.isInteger(count) && count > 0) this.#active += count;
  }

  release(count: number): void {
    if (Number.isInteger(count) && count > 0) this.#active = Math.max(0, this.#active - count);
  }
}

/** The one registry all emitters report to. */
export const particles = new ParticleRegistry();

/** A share of the registry held by one emitter: `set(n)` claims n live particles (adjusting by the difference). */
export interface ParticleClaim {
  set(count: number): void;
  release(): void;
}

export function claimParticles(registry: ParticleRegistry = particles): ParticleClaim {
  let held = 0;
  return {
    set(count) {
      const n = Math.max(0, Math.floor(count));
      if (n > held) registry.acquire(n - held);
      else if (n < held) registry.release(held - n);
      held = n;
    },
    release() {
      registry.release(held);
      held = 0;
    },
  };
}
