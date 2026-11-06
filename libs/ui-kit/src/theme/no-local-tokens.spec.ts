import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const localTokenDefinition = /--tui-[a-z0-9-]+\s*:/;

function collectTsFiles(dir: string, skipSpecs: boolean): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath, skipSpecs));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !(skipSpecs && entry.name.endsWith('.spec.ts'))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('no local Taiga token definitions in client components', () => {
  it('ui-kit and desktop dialog sources only reference inherited variables', () => {
    const roots = [
      { dir: path.resolve(repoRoot, 'libs/ui-kit/src'), skipSpecs: false },
      {
        dir: path.resolve(repoRoot, 'apps/desktop/src/pages'),
        skipSpecs: true,
      },
    ];

    for (const root of roots) {
      for (const file of collectTsFiles(root.dir, root.skipSpecs)) {
        if (
          file.endsWith('no-local-tokens.spec.ts') ||
          file.includes(`${path.sep}theme${path.sep}generated${path.sep}`)
        ) {
          continue;
        }
        const source = fs.readFileSync(file, 'utf8');
        expect(source, file).not.toMatch(localTokenDefinition);
      }
    }
  });
});
