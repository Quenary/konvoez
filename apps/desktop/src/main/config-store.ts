import * as fs from 'node:fs';
import * as path from 'node:path';
import * as z from 'zod';
import { app } from 'electron';
import { desktopHotkeysSchema } from '@konvoez/shared';

export const windowBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const desktopConfigSchema = z.object({
  serverOrigin: z.string().url().nullable(),
  hotkeys: desktopHotkeysSchema,
  autostart: z.boolean(),
  windowBounds: windowBoundsSchema.optional(),
});

export type TDesktopConfig = z.infer<typeof desktopConfigSchema>;

export const DEFAULT_DESKTOP_CONFIG: TDesktopConfig = {
  serverOrigin: null,
  hotkeys: {
    toggleMic: null,
    toggleSpeaker: null,
  },
  autostart: false,
};

export class ConfigStore {
  private config: TDesktopConfig;
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath ?? path.join(app.getPath('userData'), 'config.json');
    this.config = this.readConfig();
  }

  public get(): Readonly<TDesktopConfig> {
    return this.config;
  }

  public set(partial: Partial<TDesktopConfig>): void {
    const updated = { ...this.config, ...partial };
    const parsed = desktopConfigSchema.safeParse(updated);
    if (!parsed.success) {
      console.warn(
        '[ConfigStore] Attempted to set invalid config:',
        parsed.error,
      );
      return;
    }
    this.config = parsed.data;
    this.saveConfig();
  }

  private readConfig(): TDesktopConfig {
    if (!fs.existsSync(this.filePath)) {
      return { ...DEFAULT_DESKTOP_CONFIG };
    }

    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsedJson: unknown = JSON.parse(raw);
      const validated = desktopConfigSchema.safeParse(parsedJson);
      if (validated.success) {
        return validated.data;
      }
      this.backupCorruptedFile(raw);
    } catch {
      this.backupCorruptedFile();
    }

    return { ...DEFAULT_DESKTOP_CONFIG };
  }

  private backupCorruptedFile(rawContent?: string): void {
    const bakPath = `${this.filePath}.bak`;
    console.warn(
      `[ConfigStore] Corrupted config file detected. Restoring defaults and backing up to ${bakPath}`,
    );
    try {
      if (rawContent !== undefined) {
        fs.writeFileSync(bakPath, rawContent, 'utf-8');
      } else if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, bakPath);
      }
    } catch (err) {
      console.warn('[ConfigStore] Failed to create config backup:', err);
    }
  }

  private saveConfig(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(this.config, null, 2);

    try {
      fs.writeFileSync(tmpPath, payload, 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('[ConfigStore] Failed to write config atomically:', err);
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        // ignore tmp unlink error
      }
    }
  }
}
