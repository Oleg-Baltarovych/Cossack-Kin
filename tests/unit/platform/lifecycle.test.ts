// @vitest-environment jsdom
// Page lifecycle (SPEC §3.8): hidden = pause (save), visible again = resume. M3-16 review: `onResume` runs after the
// store resumed, so the notification plan is redone from the state the absence produced.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../../../src/core/state.ts';
import { createStore } from '../../../src/core/store.ts';
import { driveGame } from '../../../src/platform/lifecycle.ts';

const NOW = 1_780_315_800_000;

let visibility: DocumentVisibilityState = 'visible';
vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);

const setVisibility = (v: DocumentVisibilityState): void => {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('driveGame onPause / onResume', () => {
  afterEach(() => {
    visibility = 'visible';
  });

  it('resumes once on start and once per return, after the store resumed; pauses once per hide', () => {
    const store = createStore(createInitialState({ seed: 1, now: NOW }));
    const log: string[] = [];
    const resume = vi.spyOn(store, 'resume');
    const stop = driveGame(store, {
      now: () => NOW,
      onPause: () => log.push('pause'),
      onResume: () => log.push(`resume after ${String(resume.mock.calls.length)} store resumes`),
    });
    setVisibility('hidden');
    setVisibility('hidden');
    setVisibility('visible');
    window.dispatchEvent(new Event('pageshow')); // already running: no second resume
    stop();
    expect(log).toEqual(['resume after 1 store resumes', 'pause', 'resume after 2 store resumes']);
  });
});
