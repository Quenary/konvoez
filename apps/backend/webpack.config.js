const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const webpack = require('webpack');
// eslint-disable-next-line @nx/enforce-module-boundaries
const { version } = require('../../package.json');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/backend'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
    new webpack.DefinePlugin({
      __APP_VERSION__: JSON.stringify(version),
    }),
  ],
};
