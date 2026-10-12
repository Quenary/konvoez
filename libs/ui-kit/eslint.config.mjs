import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'electron',
            'node:*',
            '@angular/*',
            '@taiga-ui/*',
            '@nestjs/*',
            'fs',
            'path',
            'os',
          ],
        },
      ],
    },
  },
];
