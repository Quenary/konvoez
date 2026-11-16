module.exports = {
  displayName: 'backend',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+node_modules[/\\\\](@mikro-orm|kysely|web-push|https-proxy-agent|agent-base|proxy-agent-negotiate)[/\\\\].+\\.(m?[tj]s)$':
      '<rootDir>/esbuild-transformer.cjs',
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!.*(@mikro-orm|kysely|uuid|web-push|https-proxy-agent|agent-base|proxy-agent-negotiate))',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/backend',
};
