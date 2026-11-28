// A sheet tab in its own chunk (M4-13: «Культура»; the start scripts have a budget, ui.md). While the chunk loads, one
// line «Завантаження…»; if it fails (offline web build, a deploy replaced the chunk), «Не вдалося завантажити» and a
// retry that asks for the chunk again — `React.lazy` keeps a rejected import, so the retry makes a new lazy component.
// The rest of the sheet runs on either way.
import {
  Component,
  lazy,
  Suspense,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import { useText } from '../hooks/useText.ts';
import styles from './LazySlot.module.css';

export interface Retryable<P extends object> {
  /** The lazy component of the latest attempt. */
  readonly current: () => LazyExoticComponent<ComponentType<P>>;
  /** Drops a failed attempt: the next render imports again. */
  readonly retry: () => void;
}

export function retryable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): Retryable<P> {
  let current = lazy(load);
  return {
    current: () => current,
    retry: () => {
      current = lazy(load);
    },
  };
}

interface BoundaryProps {
  readonly failed: ReactNode;
  readonly children: ReactNode;
}

/** Catches the failed import (and only shows `failed`; the attempt is reset by remounting with a new key). */
class Boundary extends Component<BoundaryProps, { readonly failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.failed : this.props.children;
  }
}

export function LazySlot<P extends object>({ of, props }: { readonly of: Retryable<P>; readonly props: P }) {
  const { t } = useText();
  const [attempt, setAttempt] = useState(0);
  const Tab = of.current();
  return (
    <Boundary
      key={attempt}
      failed={
        <div className={styles.failed} role="alert">
          <p className={styles.text}>{t('ui.lazy.failed')}</p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              of.retry();
              setAttempt((a) => a + 1);
            }}
          >
            {t('world.failed.retry')}
          </button>
        </div>
      }
    >
      <Suspense fallback={<p className={styles.loading}>{t('ui.loading')}</p>}>
        <Tab {...props} />
      </Suspense>
    </Boundary>
  );
}
