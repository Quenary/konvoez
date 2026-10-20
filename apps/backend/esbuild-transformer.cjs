const esbuild = require('esbuild');

module.exports = {
  process(sourceText, sourcePath) {
    const result = esbuild.transformSync(sourceText, {
      format: 'cjs',
      target: 'node22',
      sourcefile: sourcePath,
    });
    return { code: result.code };
  },
};
