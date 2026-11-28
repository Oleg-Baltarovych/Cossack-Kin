// A story beat (plan M2-25, SPEC §2.5): a short scene — portrait, title, text and what the beat paid — in a modal
// window. The reward was credited by the core when the beat fired; the window only tells of it. Beats wait in a queue
// (ui/storyQueue.ts, owned by GameUi) and come one at a time after the return window. A dialog named by its title:
// the focus moves to its button and stays inside (Tab cycles), Esc closes it like the button does (the beat is already
// paid, nothing is lost), and GameUi returns the focus once the last one closes (useDialogFocus).
import { useCallback, useEffect, useId, useRef } from 'react';
import { storyBeatView } from '../../core/selectors.ts';
import { trapTab } from '../hooks/useDialogFocus.ts';
import { useText } from '../hooks/useText.ts';
import { grantedText } from '../rewards.ts';
import { useCoinLaunch } from './CoinFlight.tsx';
import type { QueuedBeat } from '../storyQueue.ts';
import { Portrait } from './Portrait.tsx';
import styles from './StoryModal.module.css';

export interface StoryModalProps {
  readonly beat: QueuedBeat & { readonly more: number };
  readonly onClose: () => void;
}

export function StoryModal({ beat, onClose }: StoryModalProps) {
  const text = useText();
  const { t } = text;
  const titleId = useId();
  const bodyId = useId();
  const boxRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const launch = useCoinLaunch();
  const latest = useRef({ onClose, launch, granted: beat.granted });
  useEffect(() => {
    latest.current = { onClose, launch, granted: beat.granted };
  });
  // Closing (the button or Esc) sends the reward's coins from the button to its counter (M2-26), if it was large.
  const close = useCallback(() => {
    const l = latest.current;
    l.launch(buttonRef.current, l.granted);
    l.onClose();
  }, []);
  // A beat opens on its own: the window takes the focus, not its button — no focus ring on the call to action until the
  // keyboard moves there; Tab reaches «Гаразд» (M4-16a review). A passive effect, after GameUi noted the opener.
  useEffect(() => {
    boxRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [close]);

  const view = storyBeatView(beat.id);
  // An id the content no longer has (the core cannot send one): nothing to tell, the queue moves on.
  useEffect(() => {
    if (!view) latest.current.onClose();
  }, [view]);
  if (!view) return null;
  const g = beat.granted;
  return (
    <div className={styles.backdrop}>
      <section
        ref={boxRef}
        tabIndex={-1}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(e) => {
          if (boxRef.current) trapTab(e, boxRef.current);
        }}
      >
        <h2 id={titleId} className={styles.title}>
          {t(view.titleKey)}
        </h2>
        <div id={bodyId} className={styles.body}>
          <Portrait id={view.portrait} />
          <p className={styles.text}>{t(view.textKey)}</p>
        </div>
        {g && (
          <dl className={styles.gains}>
            <div className={styles.gain}>
              <dt>{text.t('story.reward')}</dt>
              <dd>{grantedText(text, g)}</dd>
            </div>
          </dl>
        )}
        <button ref={buttonRef} type="button" className={styles.claim} onClick={close}>
          {t(beat.more > 0 ? 'story.next' : 'story.ok')}
        </button>
      </section>
    </div>
  );
}
