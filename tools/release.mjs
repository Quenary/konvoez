#!/usr/bin/env node
// Releases nx groups "server" and "desktop": version -> changelog -> commit/tag/push -> GitHub release (server only).
// Usage: node tools/release.mjs [--dry-run] [--group server|desktop] [--specifier patch|minor|major|x.y.z] [--first-release] [--verbose]
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { releaseChangelog, releaseVersion } from 'nx/release';

const GROUP_ANCHOR = { server: 'backend', desktop: 'desktop' };
const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    group: { type: 'string' },
    specifier: { type: 'string' },
    'first-release': { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
  },
});
const dryRun = values['dry-run'];
const groups = values.group ? [values.group] : Object.keys(GROUP_ANCHOR);
const specifier = values.specifier?.trim() || undefined;
if (specifier && !values.group) throw new Error('--specifier requires --group');

const out = (k, v) => {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  }
  console.log(`[release] ${k}=${v}`);
};

const { projectsVersionData } = await releaseVersion({
  groups,
  specifier,
  dryRun,
  verbose: values.verbose,
  firstRelease: values['first-release'],
  stageChanges: true,
  gitCommit: false,
  gitTag: false,
  gitPush: false,
});

const released = Object.fromEntries(
  groups.map((g) => [
    g,
    projectsVersionData[GROUP_ANCHOR[g]]?.newVersion ?? null,
  ]),
);
const releasedGroups = groups.filter((g) => released[g]);

const changelogVersionData = Object.fromEntries(
  Object.entries(projectsVersionData).map(([p, data]) => [
    p,
    ['backend', 'desktop'].includes(p) ? data : { ...data, newVersion: null },
  ]),
);

if (releasedGroups.length) {
  await releaseChangelog({
    versionData: changelogVersionData,
    groups: releasedGroups,
    dryRun,
    verbose: values.verbose,
    firstRelease: values['first-release'],
    stageChanges: true,
    gitCommit: true,
    gitTag: true,
    gitPush: true,
  });
}

for (const g of Object.keys(GROUP_ANCHOR)) {
  const v = released[g] ?? '';
  out(`${g}_released`, String(Boolean(v) && !dryRun));
  out(`${g}_version`, v);
}
out('dry_run', String(dryRun));
process.exit(0);
