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
