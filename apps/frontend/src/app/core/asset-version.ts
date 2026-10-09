/* eslint-disable @nx/enforce-module-boundaries */
// Versions are read from package.json at bundle time. A static `define` in
// project.json would drift from nx release, which only bumps package.json.
import { version as appVersion } from '../../../../../package.json';
import { version as noiseSuppressorVersion } from '../../../../../node_modules/@sapphi-red/web-noise-suppressor/package.json';

/** Inlined from the repo package.json when the frontend is bundled. */
export const APP_VERSION = appVersion;

/** Inlined from `@sapphi-red/web-noise-suppressor` when the frontend is bundled. */
export const NOISE_SUPPRESSOR_VERSION = noiseSuppressorVersion;

/** Query cache-buster for files nginx serves as immutable without a content hash. */
export function withVersion(path: string, version: string): string {
  return `${path}?v=${encodeURIComponent(version)}`;
}
