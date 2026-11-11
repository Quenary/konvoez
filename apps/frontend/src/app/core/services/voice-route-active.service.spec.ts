import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { VoiceRouteActiveService } from './voice-route-active.service';

describe('VoiceRouteActiveService', () => {
  let service: VoiceRouteActiveService;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', children: [] },
          {
            path: 'voice-room',
            children: [{ path: ':id', children: [] }],
          },
          { path: 'direct/:id', children: [] },
          { path: 'text-room/:id', children: [] },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    service = TestBed.inject(VoiceRouteActiveService);
    await router.navigateByUrl('/');
  });

  it.each([
    { url: '/', list: false, room: false },
    { url: '/direct/7', list: false, room: false },
    { url: '/text-room/4', list: false, room: false },
    { url: '/voice-room', list: true, room: false },
    { url: '/voice-room?tab=1', list: true, room: false },
    { url: '/voice-room#members', list: true, room: false },
    { url: '/voice-room/4', list: false, room: true },
    { url: '/voice-room/4?tab=1', list: false, room: true },
    { url: '/voice-room/4#stage', list: false, room: true },
  ])('$url is list $list and room $room', async ({ url, list, room }) => {
    await router.navigateByUrl(url);

    expect(service.isList()).toBe(list);
    expect(service.isRoom()).toBe(room);
  });

  it('follows navigation between the list, a room, and another page', async () => {
    expect(service.isList()).toBe(false);
    expect(service.isRoom()).toBe(false);

    await router.navigateByUrl('/voice-room');
    expect(service.isList()).toBe(true);
    expect(service.isRoom()).toBe(false);

    await router.navigateByUrl('/voice-room/4');
    expect(service.isList()).toBe(false);
    expect(service.isRoom()).toBe(true);

    await router.navigateByUrl('/direct/7');
    expect(service.isList()).toBe(false);
    expect(service.isRoom()).toBe(false);
  });
});
