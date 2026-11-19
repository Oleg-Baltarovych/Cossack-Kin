// Boats on the Dnipro (plan M2-11, SPEC §3.0 «ріка — човни», §6.3 «брижі від човнів»). The river is painted by the
// water passes over the base world (water.ts), so a boat in the ground layer would vanish under it: boats and their
// ripple frames live in their own container in the world's top part (after the water, before the haze/light layer).
// Graded exactly like the land:
// - the same grading filter instance (one LUT, already blended for the time of day and the weather by `gradeCycle`;
//   ColorMapFilter has no positional term, so the container's own bounds as filter area give the same colours) —
//   +2 draw calls (the filter pass) only while a boat is on screen; off screen the container is not renderable;
// - in rain, the land's wet film (ink at `wetAlpha`, light layer, after the grade) never reaches the river rows, so the
//   hulls get their own: black silhouettes of the hull frames at that alpha, after the grade (`film`, ungraded). The
//   land's film is ink 1, not black: a hull ends at most ink 1 × alpha (≤ 0.04) darker than the same colour on land.
// Ripples are water, so they get no film; at dusk/night they switch to their `night` frames (crests a step lower).
// Positions are whole px from atmosphere time: still under «менше руху» and `?freeze`.
import { Container, Sprite, type Filter, type Texture } from 'pixi.js';
import type { Boat } from '../content/villages/khortytsia.layout.ts';
import { BOATS } from './atmosphere/config.ts';
import type { DayCycle } from './atmosphere/dayCycle.ts';
import { emissiveLevel } from './atmosphere/emissive.ts';
import { overlapsX } from './cull.ts';
import { wetAlpha } from './layers/rainLayer.ts';
import type { Weather } from './settings.ts';

/** Ripple frames per variant (generator `ripple`). */
const RIPPLE_FRAMES = 3;
/** Emissive level from which the ripples take their night frames (dusk on). */
const NIGHT_RIPPLES = 0.5;

/** Whole-px x offset of a drifting boat at time `seconds` (0 for a moored one): a slow swing on the stream. */
export function boatDrift(boat: Pick<Boat, 'drift'>, seconds: number): number {
  if (boat.drift === 0) return 0;
  const v = boat.drift * Math.sin((2 * Math.PI * seconds) / BOATS.driftPeriod);
  return Math.sign(v) * Math.round(Math.abs(v)) + 0; // + 0: no −0
}

/** Ripple frame at time `seconds`, phase-shifted per boat so two boats do not lap in step. */
export function rippleFrame(seconds: number, index: number): number {
  return (Math.floor(seconds * BOATS.rippleFps) + index) % RIPPLE_FRAMES;
}

export interface BoatsFx {
  /** The graded boats (hulls + ripples). */
  readonly container: Container;
  /** The rain film over the hulls: right after `container`, ungraded. */
  readonly film: Container;
  resize(horizon: number): void;
  /** `seconds` = atmosphere time (0 under «менше руху»); the view's world x range for the on-screen test. */
  update(seconds: number, cycle: DayCycle, camX: number, viewW: number): void;
  destroy(): void;
}

/** A sprite of `texture` at its atlas anchor (every generated frame carries one; the default is the generators'). */
function anchored(texture: Texture): Sprite {
  const s = new Sprite({ texture, roundPixels: true });
  s.anchor.copyFrom(texture.defaultAnchor ?? { x: 0.5, y: 1 });
  return s;
}

export function createBoats(
  boats: readonly Boat[],
  frame: (name: string) => Texture,
  grade: Filter,
  weather: Weather,
): BoatsFx {
  const container = new Container({ label: 'boats' });
  container.filters = [grade];
  const film = new Container({ label: 'boats-wet' });
  film.visible = weather === 'rain';
  const ripples = {
    day: Array.from({ length: RIPPLE_FRAMES }, (_, i) => frame(`ripple.day/idle/0${String(i)}`)),
    night: Array.from({ length: RIPPLE_FRAMES }, (_, i) => frame(`ripple.night/idle/0${String(i)}`)),
  };
  const placed = boats.map((boat, index) => {
    const texture = frame(`${boat.sprite}/idle/00`);
    const hull = anchored(texture);
    const ripple = anchored(frame('ripple.day/idle/00'));
    const wet = anchored(texture);
    wet.tint = 0x000000;
    container.addChild(hull, ripple);
    film.addChild(wet);
    return { boat, index, hull, ripple, wet };
  });
  let horizon = 0;
  return {
    container,
    film,
    resize: (h) => {
      horizon = h;
    },
    update: (seconds, cycle, camX, viewW) => {
      const set = emissiveLevel(cycle) >= NIGHT_RIPPLES ? ripples.night : ripples.day;
      let any = false;
      for (const { boat, index, hull, ripple, wet } of placed) {
        const x = boat.x + boatDrift(boat, seconds);
        const y = horizon + boat.ground;
        hull.position.set(x, y);
        ripple.position.set(x, y);
        wet.position.set(x, y);
        const texture = set[rippleFrame(seconds, index)];
        if (texture && ripple.texture !== texture) ripple.texture = texture;
        // The ripples are the widest part, centred on the pivot.
        const w = ripple.texture.orig.width;
        any ||= overlapsX(x - Math.ceil(w / 2), w, camX, camX + viewW);
      }
      // No boat on screen: skip the container and its filter pass.
      container.renderable = any;
      film.renderable = any;
      if (film.visible) film.alpha = wetAlpha(cycle);
    },
    destroy: () => {
      container.filters = [];
      container.destroy({ children: true });
      film.destroy({ children: true });
    },
  };
}
