import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const taigaPaletteLessPath = path.resolve(
  rootDir,
  'node_modules/@taiga-ui/styles/mixins/theme/palette.less',
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
  '--tui-text-action',
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

function extractMixinBody(less, mixinName) {
  const marker = `.${mixinName}() {`;
  const start = less.indexOf(marker);
  if (start === -1) {
    throw new Error(`Missing mixin ${mixinName} in ${taigaPaletteLessPath}`);
  }
  let depth = 0;
  const openBrace = less.indexOf('{', start);
  for (let i = openBrace; i < less.length; i++) {
    if (less[i] === '{') depth++;
    if (less[i] === '}') {
      depth--;
      if (depth === 0) {
        return less.slice(openBrace + 1, i);
      }
    }
  }
  throw new Error(`Unclosed mixin ${mixinName}`);
}

function parseMixinVariables(mixinBody) {
  const map = new Map();
  const regex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(mixinBody)) !== null) {
    let val = match[2].trim();
    val = val.replace(/\/\*.*?\*\//g, '').trim();
    map.set(match[1], val);
  }
  return map;
}

function pickTokens(sourceMap, fallbackMap) {
  const result = new Map();
  for (const name of TOKEN_SUBSET) {
    const raw = sourceMap.get(name) ?? fallbackMap?.get(name);
    if (!raw) {
      throw new Error(`Missing token ${name} in Taiga palette mixins`);
    }
    result.set(name, raw);
  }
  return result;
}

const less = fs.readFileSync(taigaPaletteLessPath, 'utf8');
const lightMap = parseMixinVariables(extractMixinBody(less, 'tui-theme-light'));
const darkMap = parseMixinVariables(extractMixinBody(less, 'tui-theme-dark'));
const lightTokens = pickTokens(lightMap);
const darkTokens = pickTokens(darkMap, lightMap);

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

const generatedDir = path.resolve(rootDir, 'libs/ui-kit/src/theme/generated');
fs.mkdirSync(generatedDir, { recursive: true });

const tokensTsContent = `import { css } from 'lit';

export const tokens = css\`
${formatBlock(lightTokens, '  :host', true)}

  @media (prefers-color-scheme: dark) {
${formatBlock(darkTokens, '    :host', false, '  ')}
  }
\`;
`;

const rootTokensCss = `${formatBlock(lightTokens, ':root', true, '')}

@media (prefers-color-scheme: dark) {
${formatBlock(darkTokens, '  :root', false, '')}
}
`;

const tokensOutPath = path.resolve(generatedDir, 'tokens.ts');
const rootTokensOutPath = path.resolve(generatedDir, 'root-tokens.css');
fs.writeFileSync(tokensOutPath, tokensTsContent, 'utf8');
fs.writeFileSync(rootTokensOutPath, rootTokensCss, 'utf8');
console.log(`[generate-tokens] Wrote ${tokensOutPath}`);
console.log(`[generate-tokens] Wrote ${rootTokensOutPath}`);
