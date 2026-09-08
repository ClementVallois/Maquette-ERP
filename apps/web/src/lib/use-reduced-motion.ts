import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Read by the company-news carousel's auto-rotation timer. The timer bar itself is a CSS
 * animation (`news-progress-fill`, `globals.css`, ADR-0096), which that file's own
 * `@media (prefers-reduced-motion: reduce)` rule does collapse to a
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
