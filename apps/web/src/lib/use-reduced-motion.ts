import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Item 17, QA round 3: the company-news carousel's auto-rotation timer. Item 1, QA round 5
 * (ADR-0096) moved the timer bar itself to a CSS animation (`news-progress-fill`, `globals.css`),
 * which that file's own `@media (prefers-reduced-motion: reduce)` rule does collapse to a
 * near-zero duration — but collapsing the duration is not the same as not rotating: an animation
 * that still runs, just almost instantly, fires `onAnimationEnd` immediately and spins the
 * carousel through every message at frame rate. This hook is read in JS instead and used to skip
 * rendering the bar (and therefore rotating) at all. Reactive (a `change` listener, not a one-off
 * read) since a reviewer plausibly toggles the OS setting live while this page is open.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (): void => {
      setReduced(media.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
}
