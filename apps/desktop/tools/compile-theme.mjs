import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import less from 'less';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const themeLessPath = path.resolve(
  repoRoot,
  'libs/ui-kit/src/theme/theme.less',
);

const forbiddenCssPattern = /@font-face|url\(|@import/;

export async function compileTheme() {
  const source = fs.readFileSync(themeLessPath, 'utf8');
  const result = await less.render(source, {
    filename: themeLessPath,
    paths: [path.resolve(repoRoot, 'node_modules')],
    math: 'always',
  });

  if (forbiddenCssPattern.test(result.css)) {
    throw new Error(
      '[compile-theme] Compiled CSS must not contain @font-face, url(), or @import',
    );
  }

  return result.css;
}
