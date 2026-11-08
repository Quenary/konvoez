import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PublicApiService } from './public-api.service';
import { environment } from '@environments/environment';
import { beforeEach, describe, expect, it } from 'vitest';
import { IPublicSettings, IPublicVersion } from '@konvoez/shared';

describe('PublicApiService', () => {
  let service: PublicApiService;
  let httpMock: HttpTestingController;

  const mockSettings: IPublicSettings = {
    isOwnerSetupRequired: false,
    inviteOnlySignUp: false,
    smtpConfigured: true,
    appUrlConfigured: false,
  };

  const mockVersion: IPublicVersion = {
    currentVersion: '1.27.0',
    availableVersion: '1.27.0',
    releaseUrl: null,
    updateAvailable: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        PublicApiService,
      ],
    });

    service = TestBed.inject(PublicApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('fetches settings from /public/settings', () => {
    service.getSettings().subscribe((settings) => {
      expect(settings).toEqual(mockSettings);
    });

    const req = httpMock.expectOne(`${environment.apiPath}/public/settings`);
    expect(req.request.method).toBe('GET');
    req.flush(mockSettings);
  });

  it('fetches version from /public/version', () => {
    service.getVersion().subscribe((version) => {
      expect(version).toEqual(mockVersion);
    });

    const req = httpMock.expectOne(`${environment.apiPath}/public/version`);
    expect(req.request.method).toBe('GET');
    req.flush(mockVersion);
  });
});
