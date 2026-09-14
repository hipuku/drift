/**
 * The hardcoded-value gate (#26, 2026-09-05). The first run found 44 problems,
 * one of them a raw `font-weight: 600` between two tokenised declarations.
 *
 * The property list was ported from haus's config while drift consumed
 * haus-tokens, so both repos counted the same declarations as bypasses.
 */

/**
 * Values with no token. Eight of the original 44 had an exact token and were
 * fixed. Listing the rest by value keeps a new raw value failing; excluding
 * the rule for a property would let new values through as well.
 *
 * Composed shadows are not listed. Each carries an inline disable at the
 * declaration, with its reason.
 *
 * `--report-needless-disables` does not check this list. A value that stops
 * appearing in the stylesheets stays here until someone removes it. On
 * 2026-09-14 all seven shadow entries were unused: six named `--color-*`
 * properties that the `--drift-*` rename had removed, and the seventh matched
 * a declaration that already carried an inline disable.
 */
const OFF_SCALE = [
  /* ── Relative type ─────────────────────────────────────────────────────────
     `em` is a ratio to the parent, and no token can express that: a token would
     freeze the size the parent is trying to scale. Used where a unit or suffix
     sits inside a larger number. */
  '0.85em',
  '0.1em',

  /* ── Off the type scale ────────────────────────────────────────────────────
     Two display sizes above the scale's top step and one micro label below its
     bottom. Whether the scale should grow to meet them is drift#24's question,
     not this rule's. */
  '2.25rem',
  '2rem',
  '10px',

  /* ── Between the tracking and leading steps ────────────────────────────────
     --tracking-* is tight / normal / wide / widest, and --leading-* stops at
     1.15. These sit between or below, on display text where tracking is being
     tuned by eye against a specific string. */
  '0.06em',
  '0.04em',
  '-0.02em',
  '1.02',
  '0.9',

  /* ── Not measurements ──────────────────────────────────────────────────────
     A viewport height, and a single-pixel pull that overlaps a border rather
     than spacing anything. */
  '100vh',
  '-1px',

  /* ── Deliberately theme-independent ────────────────────────────────────────
     The transparency checker is fixed white and grey so the pattern reads at
     any theme; the fill on top is what shows opacity. Explained at the call
     site too. */
  '#fff',
]

export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      [
        '/color$/',
        'background',
        'box-shadow',
        'font-size',
        'font-weight',
        'font-family',
        'line-height',
        'letter-spacing',
        '/^padding/',
        '/^margin/',
        'gap',
        'row-gap',
        'column-gap',
        'border-radius',
        'border-width',
        'min-height',
        'z-index',
      ],
      {
        ignoreKeywords: [
          'transparent', 'currentColor', 'currentcolor',
          'inherit', 'initial', 'unset', 'revert', 'none', 'auto',
        ],
        ignoreValues: ['0', '1', '50%', '100%', '1px', '2px', '-2px', ...OFF_SCALE],
        disableFix: true,
        message: 'Use a design token: `${property}` must be a var(--…), not a hardcoded value',
      },
    ],

    /* Off, as in haus, and for the same reasons: these are house-style opinions
       the repo has already settled differently. */
    'custom-property-pattern': null,
    'selector-class-pattern': null,
    'declaration-empty-line-before': null,
    'no-descending-specificity': null,
    'alpha-value-notation': null,
    'color-function-notation': null,
    'rule-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'comment-empty-line-before': null,
    'declaration-block-single-line-max-declarations': null,
    'keyframes-name-pattern': null,
    'hue-degree-notation': null,
    'value-keyword-case': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'property-no-unknown': [true, { ignoreProperties: ['composes'] }],

    /* Off, and this one is not house style: it is a correctness decision.
       The rule assumes a build step re-adds what it strips, and this repo has
       no autoprefixer, no postcss config and no browserslist: the -webkit-
       prefixes here are hand-written and load-bearing. Running --fix with the
       rule on removed -webkit-backdrop-filter from the shell header, which
       Safari still requires, so the glass effect would have gone in Safari and
       nowhere else: a regression no test in this repo could have caught. */
    'property-no-vendor-prefix': null,
  },

  overrides: [
    {
      /* The token layers declare the values everything else reads, so a rule
         that says "use a token" cannot apply to the file defining them. */
      files: ['client/src/tokens/*.css', 'client/src/styles/*.css'],
      rules: {
        'scale-unlimited/declaration-strict-value': null,
        'no-duplicate-selectors': null,
      },
    },
  ],

  ignoreFiles: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/playwright-report/**'],
}
