import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadFileSecrets } from './file-secrets.util';

describe('loadFileSecrets', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-secrets-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads a file and strips trailing line breaks', () => {
    const filePath = path.join(tmpDir, 'master_key');
    fs.writeFileSync(filePath, 'line1\nline2\n');
    const env: NodeJS.ProcessEnv = { MASTER_KEY_FILE: filePath };

    loadFileSecrets(env);

    expect(env['MASTER_KEY']).toBe('line1\nline2');
    expect(env['MASTER_KEY_FILE']).toBeUndefined();
  });

  it('reads the file when the variable is empty', () => {
    const filePath = path.join(tmpDir, 'master_key');
    fs.writeFileSync(filePath, 'from-file\n');
    const env: NodeJS.ProcessEnv = {
      MASTER_KEY: '',
      MASTER_KEY_FILE: filePath,
    };

    loadFileSecrets(env);

    expect(env['MASTER_KEY']).toBe('from-file');
    expect(env['MASTER_KEY_FILE']).toBeUndefined();
  });

  it('throws when the file is empty', () => {
    const filePath = path.join(tmpDir, 'jwt');
    fs.writeFileSync(filePath, '\n');
    const env: NodeJS.ProcessEnv = { JWT_SECRET_FILE: filePath };

    expect(() => loadFileSecrets(env)).toThrow('JWT_SECRET_FILE is empty');
  });

  it('keeps a plain environment value when no file is set', () => {
    const env: NodeJS.ProcessEnv = { JWT_SECRET: 'from-env' };

    loadFileSecrets(env);

    expect(env['JWT_SECRET']).toBe('from-env');
  });

  it('throws when the variable and the file are both set', () => {
    const env: NodeJS.ProcessEnv = {
      SMTP_PASS: 'from-env',
      SMTP_PASS_FILE: path.join(tmpDir, 'smtp'),
    };

    expect(() => loadFileSecrets(env)).toThrow(
      'both SMTP_PASS and SMTP_PASS_FILE are set',
    );
    expect(env['SMTP_PASS']).toBe('from-env');
  });

  it('throws when the file does not exist', () => {
    const filePath = path.join(tmpDir, 'missing');
    const env: NodeJS.ProcessEnv = { S3_ACCESS_KEY_FILE: filePath };

    expect(() => loadFileSecrets(env)).toThrow(
      `S3_ACCESS_KEY_FILE does not exist: ${filePath}`,
    );
  });
});
