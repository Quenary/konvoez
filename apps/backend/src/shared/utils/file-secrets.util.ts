import fs from 'fs';

const FILE_SECRET_NAMES = [
  'MASTER_KEY',
  'JWT_SECRET',
  'SMTP_PASS',
  'S3_ACCESS_KEY_ID',
  'S3_ACCESS_KEY',
  'OLD_MASTER_KEY',
  'NEW_MASTER_KEY',
] as const;

/**
 * Reads Docker-style `NAME_FILE` paths for the explicit secret list and
 * writes the file contents back to `NAME`. An empty string counts as unset.
 */
export function loadFileSecrets(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of FILE_SECRET_NAMES) {
    const fileName = `${name}_FILE`;
    const filePath = env[fileName];
    const value = env[name];
    const hasValue = value !== undefined && value !== '';
    const hasFile = filePath !== undefined && filePath !== '';
    if (!hasValue && !hasFile) {
      continue;
    }
    if (hasValue && hasFile) {
      throw new Error(`both ${name} and ${fileName} are set`);
    }
    if (!hasFile || filePath === undefined) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (error: unknown) {
      if (isEnoent(error)) {
        throw new Error(`${fileName} does not exist: ${filePath}`, {
          cause: error,
        });
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`cannot read ${fileName} (${filePath}): ${detail}`, {
        cause: error,
      });
    }

    const secret = content.replace(/(?:\r\n|\n|\r)+$/, '');
    if (secret === '') {
      throw new Error(`${fileName} is empty`);
    }
    env[name] = secret;
    delete env[fileName];
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
