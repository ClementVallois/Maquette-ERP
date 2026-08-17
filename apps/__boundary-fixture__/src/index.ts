// A leaf on purpose: it imports nothing, so a module importing it produces a module → app
// violation and not a cycle. See README.md in this directory.
export const APP_ENTRY_POINT = '__boundary-fixture__';
