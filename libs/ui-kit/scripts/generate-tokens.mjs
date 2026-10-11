import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const lightCssPath = path.resolve(
  rootDir,
  'node_modules/@taiga-ui/design-tokens/palette/light.css',
);
const darkCssPath = path.resolve(
  rootDir,
  'node_modules/@taiga-ui/design-tokens/palette/dark.css',
);

const TOKEN_SUBSET = [
  '--tui-background-base',
  '--tui-background-base-alt',
  '--tui-background-elevation-1',
  '--tui-background-neutral-1',
  '--tui-background-neutral-1-hover',
  '--tui-background-accent-1',
  '--tui-background-accent-1-hover',
  '--tui-text-primary',
  '--tui-text-secondary',
  '--tui-text-tertiary',
  '--tui-text-primary-on-accent-1',
  '--tui-text-negative',
  '--tui-text-positive',
  '--tui-status-negative',
  '--tui-border-normal',
  '--tui-border-focus',
];

const SHAPE_TOKENS = [
  ['--tui-radius-m', '0.75rem'],
  ['--tui-radius-l', '1rem'],
  ['--tui-height-m', '2.75rem'],
  ['--tui-font-text', "'Manrope', system-ui, sans-serif"],
];

function parseCss(css) {
  const map = new Map();
  const regex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    let val = match[2].trim();
    val = val.replace(/\/\*.*?\*\//g, '').trim();
    map.set(match[1], val);
  }
  return map;
}

function resolveVal(val, map) {
  return val.replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (m, varName) => {
    const target = map.get(varName);
    return target ? resolveVal(target, map) : m;
  });
}

function extractTokens(filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  const map = parseCss(css);
  const result = new Map();
  for (const name of TOKEN_SUBSET) {
    const raw = map.get(name);
    if (!raw) {
      throw new Error(`Missing token ${name} in ${filePath}`);
    }
    result.set(name, resolveVal(raw, map));
  }
  return result;
}

const lightTokens = extractTokens(lightCssPath);
const darkTokens = extractTokens(darkCssPath);

function formatBlock(tokensMap, selector, includeShape = false, indent = '  ') {
  const lines = [`${selector} {`];
  for (const [k, v] of tokensMap.entries()) {
    lines.push(`${indent}  ${k}: ${v};`);
  }
  if (includeShape) {
    for (const [k, v] of SHAPE_TOKENS) {
      lines.push(`${indent}  ${k}: ${v};`);
    }
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

// 1. Generate libs/ui-kit/src/theme/tokens.ts
const tokensTsContent = `import { css } from 'lit';

export const tokens = css\`
${formatBlock(lightTokens, '  :host', true)}

  @media (prefers-color-scheme: dark) {
${formatBlock(darkTokens, '    :host', false, '  ')}
  }
\`;
`;

const tokensOutPath = path.resolve(rootDir, 'libs/ui-kit/src/theme/tokens.ts');
fs.mkdirSync(path.dirname(tokensOutPath), { recursive: true });
fs.writeFileSync(tokensOutPath, tokensTsContent, 'utf8');
console.log(`[generate-tokens] Wrote ${tokensOutPath}`);

// 2. Generate apps/desktop/src/pages/host.css
const hostCssContent = `${formatBlock(lightTokens, ':root', true, '')}

@media (prefers-color-scheme: dark) {
${formatBlock(darkTokens, '  :root', false, '')}
}

html,
body {
  margin: 0;
  height: 100%;
  background: var(--tui-background-base);
  color: var(--tui-text-primary);
  font-family: var(--tui-font-text);
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}
`;

const hostCssOutPath = path.resolve(rootDir, 'apps/desktop/src/pages/host.css');
fs.mkdirSync(path.dirname(hostCssOutPath), { recursive: true });
fs.writeFileSync(hostCssOutPath, hostCssContent, 'utf8');
console.log(`[generate-tokens] Wrote ${hostCssOutPath}`);
