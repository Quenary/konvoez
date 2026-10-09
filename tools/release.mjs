#!/usr/bin/env node
// Server release: version (conventional commits) -> CHANGELOG.md -> commit, tag v{version}, push -> GitHub Release.
// Usage: node tools/release.mjs [--dry-run] [--specifier patch|minor|major|x.y.z] [--verbose]
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { releaseChangelog, releaseVersion } from 'nx/release';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    specifier: { type: 'string' },
    verbose: { type: 'boolean', default: false },
  },
});

const dryRun = values['dry-run'];
const verbose = values.verbose;
const specifier = values.specifier?.trim() || undefined;

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
  console.log(`[release] ${name}=${value}`);
}

const { workspaceVersion, projectsVersionData } = await releaseVersion({
  specifier,
  dryRun,
  verbose,
  stageChanges: true,
  gitCommit: false,
  gitTag: false,
  gitPush: false,
});

if (typeof workspaceVersion !== 'string') {
  console.log(
    '[release] No releasable commits (feat/fix/perf/refactor/style/revert/breaking) since the last v* tag.',
  );
  setOutput('released', 'false');
  setOutput('version', '');
  process.exit(0);
}

await releaseChangelog({
  version: workspaceVersion,
  versionData: projectsVersionData,
  dryRun,
  verbose,
  // All three must be set. Nx treats a missing one as "subcommand" and then
  // rejects the top-level release.git config that holds the commit message.
  stageChanges: true,
  gitCommit: true,
  gitTag: true,
  gitPush: true,
});

setOutput('released', dryRun ? 'false' : 'true');
setOutput('version', workspaceVersion);
setOutput('dry_run', String(dryRun));
process.exit(0);
