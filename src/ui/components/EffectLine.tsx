// One «Культура» effect line in words, its delta («+4 %» after the purchase) alone in the gain colour (M4-16a, UI audit
// §4 p. 8: green only on the delta, never on the whole sentence). The words stay the locale's (`effectLineParts`).
import type { EffectPreview } from '../../core/culture-selectors.ts';
import { effectLineParts } from '../effectText.ts';
import type { Text } from '../hooks/useText.ts';
import styles from './Culture.module.css';

export function EffectLine({ text, effect }: { readonly text: Text; readonly effect: EffectPreview }) {
  const p = effectLineParts(text, effect);
  return (
    <>
      {p.before}
      {p.after !== null && <span className={styles.delta}>{p.after}</span>}
      {p.rest}
    </>
  );
}
