// Тіні хмар біля горизонту (plan ART-07): the far strip of cloud shadows, smaller and flatter (see cloud-shadow).
import { CLOUD_SHADOW_TILES, drawCloudShadows } from '../cloud-shadow/index.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const cloudShadowFar: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'cloud-shadow-far',
  size: CLOUD_SHADOW_TILES.far,
  frames: { idle: 1 },
  anchor: { x: 0, y: 0 },
  generate(_rng, params) {
    drawCloudShadows('far', params);
  },
};

export default cloudShadowFar;
