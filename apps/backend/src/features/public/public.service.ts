import { Injectable, Logger } from '@nestjs/common';
import { Cache } from '@nestjs/cache-manager';
import { IPublicVersion } from '@konvoez/shared';
import { AppService } from '@shared/services/app.service';

const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/Quenary/konvoez/releases/latest';
const VERSION_CACHE_KEY = 'public:version';
const VERSION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
};

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);
  private readonly currentVersion =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

  constructor(
    private readonly cacheManager: Cache,
    private readonly appService: AppService,
  ) {}

  async getVersion(): Promise<IPublicVersion> {
    const cached =
      await this.cacheManager.get<IPublicVersion>(VERSION_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const payload = await this.fetchVersionInfo();
    await this.cacheManager.set(
      VERSION_CACHE_KEY,
      payload,
      VERSION_CACHE_TTL_MS,
    );
    return payload;
  }

  private async fetchVersionInfo(): Promise<IPublicVersion> {
    const fallback: IPublicVersion = {
      currentVersion: this.currentVersion,
      availableVersion: this.currentVersion,
      releaseUrl: null,
      updateAvailable: false,
    };

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'konvoez',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (this.appService.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${this.appService.GITHUB_TOKEN}`;
      }

      const response = await fetch(GITHUB_LATEST_RELEASE_URL, { headers });

      if (!response.ok) {
        this.logger.warn(
          `Failed to fetch GitHub latest release: ${response.status} ${response.statusText}`,
        );
        return fallback;
      }

      const release = (await response.json()) as GitHubRelease;
      const availableVersion = this.normalizeVersion(release.tag_name ?? '');
      if (!availableVersion) {
        this.logger.warn('GitHub latest release response missing tag_name');
        return fallback;
      }

      const updateAvailable = this.isNewerVersion(
        availableVersion,
        this.currentVersion,
      );

      return {
        currentVersion: this.currentVersion,
        availableVersion,
        releaseUrl:
          updateAvailable && release.html_url ? release.html_url : null,
        updateAvailable,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to fetch GitHub latest release: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fallback;
    }
  }

  private normalizeVersion(tag: string): string {
    return tag.trim().replace(/^v/i, '');
  }

  private isNewerVersion(available: string, current: string): boolean {
    const availableParts = this.parseSemver(available);
    const currentParts = this.parseSemver(current);
    if (!availableParts || !currentParts) {
      return false;
    }

    for (let i = 0; i < 3; i++) {
      if (availableParts[i] > currentParts[i]) {
        return true;
      }
      if (availableParts[i] < currentParts[i]) {
        return false;
      }
    }
    return false;
  }

  private parseSemver(version: string): [number, number, number] | null {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (!match) {
      return null;
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }
}
