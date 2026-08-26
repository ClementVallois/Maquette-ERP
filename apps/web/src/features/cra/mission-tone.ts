/**
 * "Une teinte par ligne, stable dans le mois" (ADR-0070, task 6.2) — six hues, cycling by the
 * mission's position among the grid's visible rows. Six because a seventh staffed mission in one
 * month is ADR-0070's own reconsideration threshold for the row list itself ("roughly eight"),
 * past which repeating a hue is the smaller problem.
 *
 * The class names are written out literally rather than built with template-string
 * interpolation (`` `bg-mission-tone-${n}-fill` ``): Tailwind's build-time scanner finds class
 * names by static text search, and a computed string is invisible to it — the utility would
 * simply never be generated. `globals.css`'s `@theme inline` block declares the six
 * `--color-mission-tone-*` variables these six pairs read.
 */
const MISSION_TONES = [
  { fillClass: 'bg-mission-tone-1-fill', dotClass: 'bg-mission-tone-1-dot' },
  { fillClass: 'bg-mission-tone-2-fill', dotClass: 'bg-mission-tone-2-dot' },
  { fillClass: 'bg-mission-tone-3-fill', dotClass: 'bg-mission-tone-3-dot' },
  { fillClass: 'bg-mission-tone-4-fill', dotClass: 'bg-mission-tone-4-dot' },
  { fillClass: 'bg-mission-tone-5-fill', dotClass: 'bg-mission-tone-5-dot' },
  { fillClass: 'bg-mission-tone-6-fill', dotClass: 'bg-mission-tone-6-dot' },
] as const;

export interface MissionTone {
  readonly fillClass: string;
  readonly dotClass: string;
}

/** `index` is the mission's position among the grid's currently visible rows — not a hash of its
 * id, so the tone stays stable while a row is visible and is free to be reused once a row is
 * removed (task 6.3's "retirer la ligne"). */
export function missionTone(index: number): MissionTone {
  return MISSION_TONES[index % MISSION_TONES.length] ?? MISSION_TONES[0];
}
