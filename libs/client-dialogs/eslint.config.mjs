import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
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
