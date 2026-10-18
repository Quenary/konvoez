module.exports = {
  displayName: 'backend',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+node_modules[/\\\\](@mikro-orm|kysely)[/\\\\].+\\.js$':
      '<rootDir>/esbuild-transformer.cjs',
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@mikro-orm|kysely|uuid)/)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/backend',
};
