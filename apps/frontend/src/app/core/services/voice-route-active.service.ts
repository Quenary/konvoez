import { computed, inject, Injectable } from '@angular/core';
import { isActive, Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class VoiceRouteActiveService {
  private readonly router = inject(Router);

  /**
   * Check if the current route is the voice page (list)
   */
  public readonly isList = isActive('/voice-room', this.router, {
    paths: 'exact',
    queryParams: 'ignored',
    fragment: 'ignored',
    matrixParams: 'ignored',
  });
  /**
   * Check if the current route is a child (voice room)
   */
  public readonly isRoom = computed(() => {
    const any = this.isAny();
    const list = this.isList();
    return any && !list;
  });

  private readonly isAny = isActive('/voice-room', this.router, {
    paths: 'subset',
    queryParams: 'ignored',
    fragment: 'ignored',
    matrixParams: 'ignored',
  });
}
