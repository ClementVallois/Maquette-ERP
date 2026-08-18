import { InvalidValueError } from './errors.ts';
import type { IsoDate } from './iso-date.ts';

/**
 * A value that was true between two dates. Both bounds are **inclusive** and `to` is `null` while
 * the value is still in force — the same convention as an `Assignment` or a mission's end date,
 * because a reader who has to remember two conventions will apply the wrong one.
 */
export interface Effective<TValue> {
  readonly from: IsoDate;
  readonly to: IsoDate | null;
  readonly value: TValue;
}

/**
 * A dated reference: the history of one thing that changes over time, answering "what was true on
 * this date". One mechanism for every such reference in the chain — the manager a consultant is
 * attached to, the `Tjm` agreed on a mission — because they are the same question and a second
 * implementation is a second set of edge cases. See docs/adr/0034.
 */
export interface Timeline<TValue> {
  readonly entries: readonly Effective<TValue>[];
  at(date: IsoDate): TValue | null;
}

export function timeline<TValue>(entries: readonly Effective<TValue>[]): Timeline<TValue> {
  const sorted = [...entries].sort((left, right) => left.from.localeCompare(right.from));

  for (const [index, entry] of sorted.entries()) {
    if (entry.to !== null && entry.to < entry.from) {
      throw new InvalidValueError('timeline.entry', entry, 'a period that ends after it starts');
    }

    const next = sorted[index + 1];
    if (next !== undefined && (entry.to === null || next.from <= entry.to)) {
      throw new InvalidValueError(
        'timeline',
        { first: entry, second: next },
        'periods that do not overlap',
      );
    }
  }

  return {
    entries: sorted,

    at(date) {
      const match = sorted.find(
        (entry) => entry.from <= date && (entry.to === null || date <= entry.to),
      );

      return match?.value ?? null;
    },
  };
}
