// Брама by tier (plan M2-09, ART-BIBLE §6 «брама: вежа над проїздом, малинова корогва»): the M1 `gate` frame drawn in
// its later looks — t2 (walls II–III): the pole without its painted cloth (the wind-blown `banner` add-on hangs there)
// and the moat with a plank bridge seen through the passage; t4 (walls IV): + a gilt finial and knob, the Pokrova icon
// over the passage, a gold-studded eave band. Same canvas and pivot as `gate`.
import type { SpriteGenerator } from '../../lib/types.ts';
import { GATE_ANCHOR, GATE_H, GATE_W, paintGate, type GateLook } from '../gate/index.ts';

const LOOKS: Readonly<Record<'t2' | 't4', GateLook>> = {
  t2: { cloth: false, bridge: true, gilt: false },
  t4: { cloth: false, bridge: true, gilt: true },
};

const brama: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'brama',
  size: { w: GATE_W, h: GATE_H },
  frames: { idle: 1 },
  variants: ['t2', 't4'],
  layers: ['emissive', 'shadow'],
  anchor: GATE_ANCHOR,
  generate(_rng, params) {
    paintGate(params, params.variant === 't4' ? LOOKS.t4 : LOOKS.t2);
  },
};

export default brama;
