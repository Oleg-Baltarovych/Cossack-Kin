// Construction and tier juice on screen (plan M2-12; timing in render/fx/construction.ts). render/bridge.ts calls
// `construct` on `BuildingUpgraded` 0 → 1 and `celebrate` on `TierReached`; the game state already holds the new
// level. Each frame `present(scene, nowMs)` returns the scene as it should look now — a building under scaffolding
// shown at tier 0, a popping one with its `pop` scale — so every layer (props, plot tiles, smoke, window lights)
// follows without knowing about construction. Two containers: `world` (graded, right over the ground layer: scaffolds,
// dust, the rising standard) and `top` (after the grade, like the tap coins: confetti and the flash read the same at
// night). Times are real ms (`performance.now()`), so a `?freeze` shot steps with Playwright's clock.
import { Container, Sprite, type Texture } from 'pixi.js';
import type { PlotBuilding, WorldLayout } from '../../content/villages/khortytsia.layout.ts';
import { claimParticles } from './registry.ts';
import {
  buildFrame,
  celebrationFrame,
  celebrationStart,
  confettiPieces,
  dustPuffs,
  knocksBetween,
  scaffoldBays,
  scaffoldSize,
  STANDARD_FRAMES,
  type FxPiece,
} from './construction.ts';
import { BUILD, PLOT_MARK } from '../atmosphere/config.ts';
import { rampColor } from '../palette.ts';
import type { PlotMark } from './outline.ts';
import type { SceneState } from '../scene.ts';

export interface BuildFx {
  /** Graded world content (insert right after the ground layer's container). */
  readonly world: Container;
  /** After the grade, at ground parallax. */
  readonly top: Container;
  construct(building: PlotBuilding, nowMs: number): void;
  celebrate(building: PlotBuilding, nowMs: number): void;
  /**
   * Steps every running sequence to `nowMs`; returns the scene to draw this frame. `emissive` 0..1 = the night masks'
   * opacity (atmosphere/emissive.ts): the standard's gold finial glints with the windows, and from
   * `PLOT_MARK.nightFrom` on a new tier lights a warm rim on the building (scene `marks`) instead of the star flash.
   */
  present(scene: SceneState, nowMs: number, emissive: number): SceneState;
  destroy(): void;
}

interface Site {
  readonly x: number;
  readonly ground: number;
  /** Px of the base frame above its pivot (its visible height). */
  readonly above: number;
  /** Half the base frame's width right of its pivot. */
  readonly right: number;
  readonly size: 's' | 'l';
  /** Scaffolds side by side (`scaffoldBays`), centred on the pivot. */
  readonly bays: number;
  readonly seed: number;
}

const frames = (frame: (name: string) => Texture, stem: string, n: number): Texture[] =>
  Array.from({ length: n }, (_, i) => frame(`${stem}/idle/${String(i).padStart(2, '0')}`));

/** A pool of sprites drawn from `textures` (anchor from the atlas). */
function pool(into: Container, textures: readonly Texture[], n: number): Sprite[] {
  const first = textures[0];
  if (!first) throw new Error('build fx: no frames');
  return Array.from({ length: n }, () => {
    const s = new Sprite({ texture: first, roundPixels: true });
    s.anchor.copyFrom(first.defaultAnchor ?? { x: 0.5, y: 1 });
    s.visible = false;
    into.addChild(s);
    return s;
  });
}

function place(sprites: readonly Sprite[], pieces: readonly FxPiece[], textures: readonly Texture[]): void {
  sprites.forEach((s, i) => {
    const p = pieces[i];
    s.visible = p !== undefined;
    if (!p) return;
    s.position.set(p.x, p.y);
    const t = textures[p.frame];
    if (t && s.texture !== t) s.texture = t;
  });
}

export function createBuildFx(
  layout: WorldLayout,
  frame: (name: string) => Texture,
  lessMotion: boolean,
  horizon: () => number,
  /** Called once per scaffold stage as it goes up (the builders' knocking, M2-18): the audio hook (M7). */
  onKnock: (building: PlotBuilding) => void = () => undefined,
): BuildFx {
  const world = new Container({ label: 'build' });
  const top = new Container({ label: 'build-top' });
  const sites = new Map<PlotBuilding, Site>();
  for (const t of layout.tierSprites) {
    // The building's tier-I look: its widest grounded part is the base.
    const base = t.tiers[0].parts
      .filter((p) => p.lift === undefined)
      .map((p) => frame(`${p.sprite}/idle/00`))
      .reduce<Texture | null>((a, b) => (a && a.width >= b.width ? a : b), null);
    if (!base || sites.has(t.building)) continue;
    const anchor = base.defaultAnchor ?? { x: 0.5, y: 1 };
    sites.set(t.building, {
      x: t.x,
      ground: t.ground,
      above: Math.round(base.height * anchor.y),
      right: Math.round(base.width * (1 - anchor.x)),
      size: scaffoldSize(base.width, base.height),
      bays: scaffoldBays(base.width, scaffoldSize(base.width, base.height)),
      seed: t.x,
    });
  }
  const scaffolds = { s: frames(frame, 'scaffold.s', 3), l: frames(frame, 'scaffold.l', 3) };
  const dustFrames = frames(frame, 'dust', 3);
  const confettiFrames = frames(frame, 'confetti', 4);
  const flashFrames = frames(frame, 'flash', 3);
  const standardFrames = frames(frame, 'standard', STANDARD_FRAMES);
  const glintFrames = frames(frame, 'standard@emissive', STANDARD_FRAMES);

  // One running sequence per building at a time (a second purchase restarts nothing: levels only go up).
  const builds = new Map<
    PlotBuilding,
    { start: number; scaffold: Sprite[]; dust: Sprite[]; confetti: Sprite[]; knockedMs: number }
  >();
  const parties = new Map<PlotBuilding, { start: number; flash: Sprite; standard: Sprite; glint: Sprite }>();
  const claim = claimParticles();
  const rimSteps = PLOT_MARK.flashRimSteps.map(([until, [ramp, shade]]) => ({ until, color: rampColor(ramp, shade) }));

  const dispose = (sprites: readonly Sprite[]): void => {
    for (const s of sprites) s.destroy();
  };

  return {
    world,
    top,
    construct(building, nowMs) {
      const site = sites.get(building);
      if (!site || builds.has(building)) return;
      const scaffold = pool(world, scaffolds[site.size], site.bays);
      builds.set(building, {
        start: nowMs,
        knockedMs: -1,
        scaffold,
        dust: lessMotion ? [] : pool(world, dustFrames, BUILD.dust),
        confetti: lessMotion ? [] : pool(top, confettiFrames, BUILD.confetti),
      });
    },
    celebrate(building, nowMs) {
      if (!sites.has(building)) return;
      const old = parties.get(building);
      if (old) dispose([old.flash, old.standard, old.glint]);
      const [flash] = pool(top, flashFrames, 1);
      const [standard] = pool(world, standardFrames, 1);
      const [glint] = pool(top, glintFrames, 1);
      if (!flash || !standard || !glint) return;
      const start = celebrationStart(nowMs, builds.get(building)?.start ?? null);
      parties.set(building, { start, flash, standard, glint });
    },
    present(scene, nowMs, emissive) {
      if (builds.size === 0 && parties.size === 0) {
        claim.set(0);
        return scene;
      }
      const y0 = horizon();
      let tiers = scene.tiers;
      let pop: Partial<Record<PlotBuilding, number>> | undefined;
      let live = 0;
      const night = emissive >= PLOT_MARK.nightFrom;
      const rims: PlotMark[] = [];
      for (const [building, b] of builds) {
        const site = sites.get(building);
        const f = buildFrame(nowMs - b.start, lessMotion);
        for (let k = knocksBetween(b.knockedMs, nowMs - b.start); k > 0; k--) onKnock(building);
        b.knockedMs = nowMs - b.start;
        if (!site || f.kind === 'done') {
          dispose([...b.scaffold, ...b.dust, ...b.confetti]);
          builds.delete(building);
          continue;
        }
        const at = { x: site.x, y: y0 + site.ground, seed: site.seed };
        for (const s of b.scaffold) s.visible = f.kind === 'scaffold';
        if (f.kind === 'scaffold') {
          // The building waits behind its scaffold: drawn as the empty plot until the reveal.
          if (tiers) tiers = { ...tiers, [building]: 0 };
          const t = scaffolds[site.size][f.stage];
          const bay = BUILD.scaffoldW[site.size];
          b.scaffold.forEach((s, i) => {
            if (t) s.texture = t;
            // Bays abut, centred on the pivot (whole px).
            s.position.set(at.x + Math.round((i - (site.bays - 1) / 2) * bay), at.y);
          });
          const dust = b.dust.length > 0 ? dustPuffs(at, nowMs - b.start, bay * site.bays) : [];
          place(b.dust, dust, dustFrames);
          live += dust.length;
          continue;
        }
        place(b.dust, [], dustFrames);
        if (f.scale !== 1) pop = { ...pop, [building]: f.scale };
        const pieces =
          b.confetti.length > 0
            ? confettiPieces({ ...at, y: at.y - Math.round(site.above * BUILD.confettiFrom) }, f.burstMs)
            : [];
        place(b.confetti, pieces, confettiFrames);
        live += pieces.length;
      }
      for (const [building, p] of parties) {
        const site = sites.get(building);
        const f = celebrationFrame(nowMs - p.start, lessMotion);
        if (!site || f.kind === 'done') {
          dispose([p.flash, p.standard, p.glint]);
          parties.delete(building);
          continue;
        }
        // Waiting for its building's reveal.
        const waiting = nowMs < p.start;
        p.standard.visible = !waiting;
        p.glint.visible = !waiting && emissive > 0.01;
        p.flash.visible = !waiting && f.flash !== null && !night;
        if (waiting) continue;
        const rimAt = nowMs - p.start;
        const step = rimSteps.find(({ until }) => rimAt < until * PLOT_MARK.flashRimMs);
        if (night && !lessMotion && step) rims.push({ building, color: step.color, alpha: 1, rim: true });
        const t = standardFrames[f.standard];
        if (t) p.standard.texture = t;
        // Planted just right of the building, a row in front of its pivot.
        p.standard.position.set(site.x + Math.round(site.right * 0.6), y0 + site.ground + 2);
        const g = glintFrames[f.standard];
        if (g) p.glint.texture = g;
        p.glint.position.copyFrom(p.standard.position);
        p.glint.alpha = Math.min(1, emissive);
        if (f.flash !== null) {
          const ft = flashFrames[f.flash];
          if (ft) p.flash.texture = ft;
          p.flash.position.set(site.x, y0 + site.ground - Math.round(site.above / 2));
        }
      }
      claim.set(live);
      if (tiers === scene.tiers && pop === undefined && rims.length === 0) return scene;
      return {
        ...scene,
        tiers,
        ...(pop === undefined ? {} : { pop }),
        ...(rims.length === 0 ? {} : { marks: [...(scene.marks ?? []), ...rims] }),
      };
    },
    destroy() {
      claim.release();
      builds.clear();
      parties.clear();
      world.destroy({ children: true });
      top.destroy({ children: true });
    },
  };
}
