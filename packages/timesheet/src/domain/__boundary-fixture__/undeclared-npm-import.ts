// Deliberate violation, and the sibling of `forbidden-npm-import.ts` — a different classification
// of the same offence. That one imports `vitest`, which this package declares, so the cruiser
// calls it `npm-dev`. This one imports a package declared only in the ROOT manifest, which the
// cruiser calls `npm-no-pkg` — the type the ban had never listed, so it was the one way a domain
// file could import a driver and cruise clean. See README.md in this directory.
import { format } from 'prettier';

export const stolen = format;
