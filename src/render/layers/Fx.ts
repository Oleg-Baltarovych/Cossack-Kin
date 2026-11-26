// Layer 6 — effects (parallax 1.0, graded, SPEC §6.2). Chimney smoke (plan M2-11): every prop with a `smoke` vent
// (khatas, the potter, the tavern, the smithy, the Sich's kurins) whose plot stands puffs `QUALITY_TIERS[q].smoke`
// particles (render/fx/smoke.ts) that drift with the game's wind; «менше руху» shows a still plume instead (no
// particles). The puffs are binary-alpha frames of the scene atlas, so the layer batches with the ground and the
// world's night grade darkens them like the roofs (no glow over the sky). Weather particles live in the light layer.
import { Container, Sprite, type Texture } from 'pixi.js';
import type { Prop, SmokeVent, WorldLayout } from '../../content/villages/khortytsia.layout.ts';
import { QUALITY_TIERS } from '../atmosphere/config.ts';
import { claimParticles } from '../fx/registry.ts';
import { smokePuffs, stillPlume, type Puff } from '../fx/smoke.ts';
import { plotShown } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { createLayer, horizonY, type WorldLayer } from './Layer.ts';

/**
 * A chimney is drawn while its mouth is within this many px of the view: a puff is ≤ 9 px wide and a gale bends the
 * plume ≲ 50 px downwind (SMOKE.rise × lean.gale).
 */
const CULL_MARGIN = 56;
/** Puffs a chimney can hold at most (the high tier); sprites are made once. */
const MAX_PUFFS = Math.max(...Object.values(QUALITY_TIERS).map((t) => t.smoke));

export interface FxLayerOptions {
  readonly layout: WorldLayout;
  readonly frame: (name: string) => Texture;
  readonly lessMotion: boolean;
  /** `null` = auto, starts at med. */
  readonly quality: Quality | null;
}

interface Chimney {
  readonly prop: Prop;
  readonly vent: SmokeVent;
  /** World column of the mouth; also the chimney's puff seed (stable when props are inserted before it). */
  readonly x: number;
  readonly sprites: readonly Sprite[];
}

export function createFxLayer({ layout, frame, lessMotion, quality }: FxLayerOptions): WorldLayer {
  return createLayer('fx', 1, (container) => {
    const young = frame('smoke/idle/00');
    const frames: readonly Texture[] = [young, frame('smoke/idle/01'), frame('smoke/idle/02')];
    const smoke = new Container({ label: 'smoke' });
    container.addChild(smoke);
    const chimneys: Chimney[] = [];
    for (const prop of layout.props) {
      const vent = prop.smoke;
      if (!vent) continue;
      const sprites: Sprite[] = [];
      for (let i = 0; i < MAX_PUFFS; i++) {
        const s = new Sprite({ texture: young, roundPixels: true });
        // Every generated frame carries its anchor; the default is the generator's (bottom centre).
        s.anchor.copyFrom(young.defaultAnchor ?? { x: 0.5, y: 1 });
        s.visible = false;
        smoke.addChild(s);
        sprites.push(s);
      }
      chimneys.push({ prop, vent, x: prop.x + vent.dx, sprites });
    }
    const claim = claimParticles();
    let perChimney: number = QUALITY_TIERS[quality ?? 'med'].smoke;
    let horizon = 0;
    let viewW = 0;
    const hide = (sprites: readonly Sprite[], from: number): void => {
      for (let i = from; i < sprites.length; i++) {
        const s = sprites[i];
        if (s) s.visible = false;
      }
    };
    return {
      resize: (size) => {
        horizon = horizonY(size.viewH);
        viewW = size.viewW;
      },
      setQuality: (q) => {
        perChimney = QUALITY_TIERS[q].smoke;
      },
      dispose: () => {
        claim.release();
      },
      update: ({ ambient, scene, camX }) => {
        // The claim counts every standing chimney's puffs, on screen or not: like the campfire sparks, a particle
        // claim is the world-wide worst case (`.claude/rules/render.md` «World and scene»), so the budget reading does not jump with
        // the camera — only the drawing is culled.
        let live = 0;
        for (const { prop, vent, x, sprites } of chimneys) {
          const shown = plotShown(prop.plot, scene.tiers, scene.variants);
          if (shown && !lessMotion) live += perChimney;
          if (!shown || x < camX - CULL_MARGIN || x > camX + viewW + CULL_MARGIN) {
            hide(sprites, 0);
            continue;
          }
          const at = { x, y: horizon + prop.ground - vent.lift, seed: x };
          const puffs: readonly Puff[] = lessMotion
            ? stillPlume(at, scene.wind)
            : smokePuffs(ambient, at, scene.wind, perChimney);
          for (let i = 0; i < puffs.length; i++) {
            const p = puffs[i];
            const s = sprites[i];
            if (!p || !s) continue;
            s.visible = true;
            s.position.set(p.x, p.y);
            const texture = frames[p.frame];
            if (texture && s.texture !== texture) s.texture = texture;
          }
          hide(sprites, puffs.length);
        }
        claim.set(live);
      },
    };
  });
}
