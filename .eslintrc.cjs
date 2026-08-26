module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script'
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'work/',
    'web-dist/',
    'swf2png-master/',
    'res/features/wikiview/jquery.min.js',
    'res/ruffle/'
  ],
  rules: {
    'no-console': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      globals: { test: 'readonly' }
    },
    {
      files: ['res/features/wikiview/**/*.js'],
      globals: {
        $: 'readonly',
        hovered: 'readonly',
        unhovered: 'readonly',
        hoveredName: 'readonly',
        unhoveredName: 'readonly'
      },
      rules: { 'no-inner-declarations': 'off' }
    }
  ]
};
