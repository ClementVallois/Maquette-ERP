import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Item 17, QA round 3: the company-news carousel's auto-rotation is a JS `requestAnimationFrame` loop, not a CSS
 * transition — `globals.css`'s own `@media (prefers-reduced-motion: reduce)` rule (which collapses
 * every animation/transition duration to near-zero) has nothing to catch here, so this is read in
 * JS instead and used to skip starting the interval at all. Reactive (a `change` listener, not a
 * one-off read) since a reviewer plausibly toggles the OS setting live while this page is open.
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
