const base = require('./.dependency-cruiser.cjs');

// Same rules, fixtures no longer excluded. Used only by the guard's negative tests. The
// node_modules half of the exclusion is kept as the base config narrows it: an npm package has to
// stay visible for the domain fixture to be able to violate anything.
module.exports = {
  ...base,
  options: { ...base.options, exclude: { path: '(^|/)packages/[^/]+/node_modules/' } },
};
