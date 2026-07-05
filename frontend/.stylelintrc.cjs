// Minimal, self-contained stylelint config.
//
// Replaces the abandoned `@iceworks/spec` preset: that package pulled
// `stylelint-config-ali` and was never listed in devDependencies, so
// `npm run stylelint` crashed with "Could not find @iceworks/spec". This
// config uses only stylelint core rules (already installed), so it runs
// out of the box.
//
// Kept intentionally light — a functional linter, not a strict gate —
// mirroring the pragmatic ratchet used for ESLint. stylelint is not wired
// into CI (CI runs `lint:ci`, which is ESLint only); this exists so the
// local `npm run lint` works.
module.exports = {
  rules: {
    // Tailwind directives live in src/index.css; don't flag them as unknown.
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'apply',
          'variants',
          'responsive',
          'screen',
          'layer',
          'config',
          'theme',
        ],
      },
    ],
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'no-duplicate-at-import-rules': true,
    'no-invalid-double-slash-comments': true,
  },
};
