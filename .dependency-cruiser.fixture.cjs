const base = require('./.dependency-cruiser.cjs');

// Same rules, fixture no longer excluded. Used only by the guard's negative test.
module.exports = {
  ...base,
  options: { ...base.options, exclude: { path: '(^|/)node_modules/' } },
};
