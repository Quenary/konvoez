import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RolesApiService } from './roles-api.service';
import { EPermission } from '@konvoez/shared';

describe('RolesApiService', () => {
  it('calls correct HTTP endpoints for CRUD', () => {
    const get = vi.fn().mockReturnValue(of([]));
    const post = vi.fn().mockReturnValue(of({}));
    const put = vi.fn().mockReturnValue(of({}));
    const del = vi.fn().mockReturnValue(of(undefined));

    TestBed.configureTestingModule({
      providers: [
        RolesApiService,
        {
          provide: HttpClient,
          useValue: { get, post, put, delete: del },
        },
      ],
    });

    const service = TestBed.inject(RolesApiService);

    service.list().subscribe();
    expect(get).toHaveBeenCalledWith('/api/v1/roles', {
      withCredentials: true,
    });

    const createDto = {
      name: 'Tester',
      priority: 0,
      isDefault: false,
      permissions: [EPermission.SEND_MESSAGES],
    };
    service.create(createDto).subscribe();
    expect(post).toHaveBeenCalledWith('/api/v1/roles', createDto, {
      withCredentials: true,
    });

    service.get(1).subscribe();
    expect(get).toHaveBeenCalledWith('/api/v1/roles/1', {
      withCredentials: true,
    });

    const updateDto = { name: 'Updated' };
    service.update(1, updateDto).subscribe();
    expect(put).toHaveBeenCalledWith('/api/v1/roles/1', updateDto, {
      withCredentials: true,
    });

    service.remove(1).subscribe();
    expect(del).toHaveBeenCalledWith('/api/v1/roles/1', {
      withCredentials: true,
    });
  });
});
