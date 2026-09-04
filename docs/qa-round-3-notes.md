# QA round 3 — implementation notes

Short notes on anything that needed a judgment call, for Clement to convert into proper ADRs where
warranted. Not exhaustive documentation — see the commit messages for the rest.

## Item 27 — kept the trailing period

The item's target string was given as `'Une journée ne peut pas dépasser le volume horaire
prévu'` (no trailing period). Every other entry in `problem.sentences` (both label files) ends
with a period, including its immediate neighbours. Shipped with the period, on the assumption the
period was dropped incidentally when the item was written down, not a deliberate instruction to
break the file's own punctuation convention. Flagging in case that reading is wrong.

## Item 31 — the timeline is a third display site

The brief named the CRA banner (consultant + manager read). `apps/web/src/features/cra/components/cra-timeline.tsx`
repeats the same manager reason as the business timeline's "CRA refusé" entry `detail`. Confirmed
in `apps/api/src/routes/api.ts`'s `craTimeline` builder that `detail` is only ever populated for
the `refused` timeline kind (never for `submitted`/`validated`), so prefixing it there
unconditionally is safe and was added in a follow-up commit.
