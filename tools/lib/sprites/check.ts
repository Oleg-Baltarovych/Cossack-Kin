// Frame checks for `pnpm sprites` (plan M0-08, art.md): every visible px is a palette color, alpha is
// binary outside the soft-alpha atlases, the frame fits its declared size. Defence in depth for generators
// (palette by construction) and the only guard for external RGB sources.
import type { RgbaImage } from '../png.ts';
import type { Palette } from '../../../assets-src/gen/lib/palette.ts';
import type { Size } from '../../../assets-src/gen/lib/types.ts';

/** Atlases allowed to contain semi-transparent px (soft gradients, glows). Explicit list, plan M0-08. */
export const SOFT_ALPHA_ATLASES: readonly string[] = ['fx'];

/** Problems reported per frame before the rest is summarised. */
const MAX_REPORTED = 20;

export interface FrameCheck {
  readonly name: string;
  readonly declared: Size;
  readonly softAlpha: boolean;
}

export function checkFrame(image: RgbaImage, palette: Palette, check: FrameCheck): string[] {
  const { name, declared, softAlpha } = check;
  if (image.width > declared.w || image.height > declared.h) {
    return [
      `${name}: frame ${String(image.width)}×${String(image.height)} exceeds the declared ${String(declared.w)}×${String(declared.h)}`,
    ];
  }
  const problems: string[] = [];
  let hidden = 0;
  const report = (text: string): void => {
    if (problems.length < MAX_REPORTED) problems.push(`${name}: ${text}`);
    else hidden += 1;
  };
  const { width, height, data } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const a = data[o + 3] ?? 0;
      if (a === 0) continue;
      const at = `at (${String(x)}, ${String(y)})`;
      const rgb = ((data[o] ?? 0) << 16) | ((data[o + 1] ?? 0) << 8) | (data[o + 2] ?? 0);
      if (!palette.colors.has(rgb)) report(`off-palette #${rgb.toString(16).padStart(6, '0')} ${at}`);
      if (a !== 255 && !softAlpha) {
        report(
          `semi-transparent alpha ${String(a)} ${at} (soft alpha is allowed only in atlases: ${SOFT_ALPHA_ATLASES.join(', ')})`,
        );
      }
    }
  }
  if (hidden > 0) problems.push(`${name}: …and ${String(hidden)} more`);
  return problems;
}
