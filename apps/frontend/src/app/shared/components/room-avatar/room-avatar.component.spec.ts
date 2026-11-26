import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoomAvatarComponent } from './room-avatar.component';

describe('RoomAvatarComponent', () => {
  let fixture: ComponentFixture<RoomAvatarComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomAvatarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomAvatarComponent);
    element = fixture.nativeElement;
  });

  it('renders room initials when avatarUrl is null', () => {
    fixture.componentRef.setInput('name', 'General Chat');
    fixture.componentRef.setInput('avatarUrl', null);
    fixture.detectChanges();

    expect(element.querySelector('img')).toBeNull();
    const span = element.querySelector('span');
    expect(span?.textContent?.trim()).toBe('GC');
    expect(span?.style.color).toBe('');
  });

  it('uses initialsSource and optional color when provided', () => {
    fixture.componentRef.setInput('name', 'bob');
    fixture.componentRef.setInput('initialsSource', 'Bob Ross');
    fixture.componentRef.setInput('color', 'rgb(10, 20, 30)');
    fixture.componentRef.setInput('avatarUrl', null);
    fixture.detectChanges();

    const span = element.querySelector('span');
    expect(span?.textContent?.trim()).toBe('BR');
    expect(span?.style.color).toBe('rgb(10, 20, 30)');
  });

  it('renders initials immediately while img loads and hides them after load', () => {
    fixture.componentRef.setInput('name', 'Lobby');
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/lobby.png');
    fixture.detectChanges();

    const img = element.querySelector('img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/lobby.png');
    expect(img?.getAttribute('alt')).toBe('Lobby');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.classList.contains('loaded')).toBe(false);
    expect(element.querySelector('span')?.textContent?.trim()).toBe('L');

    img?.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(img?.classList.contains('loaded')).toBe(true);
    expect(element.classList.contains('loaded')).toBe(true);
    expect(element.querySelector('span')).toBeNull();
  });

  it('falls back to initials on error and resets when avatarUrl changes', () => {
    fixture.componentRef.setInput('name', 'Lobby');
    fixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/broken.png',
    );
    fixture.detectChanges();

    element.querySelector('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('span')?.textContent?.trim()).toBe('L');

    fixture.componentRef.setInput('avatarUrl', 'https://example.com/valid.png');
    fixture.detectChanges();

    const retryImg = element.querySelector('img');
    expect(retryImg?.getAttribute('src')).toBe('https://example.com/valid.png');
    expect(retryImg?.classList.contains('loaded')).toBe(false);
    expect(element.querySelector('span')?.textContent?.trim()).toBe('L');

    retryImg?.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(retryImg?.classList.contains('loaded')).toBe(true);
    expect(element.querySelector('span')).toBeNull();
  });

  it('supports priority mode', () => {
    fixture.componentRef.setInput('name', 'Lobby');
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/lobby.png');
    fixture.componentRef.setInput('priority', true);
    fixture.detectChanges();

    const img = element.querySelector('img');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
    expect(img?.getAttribute('loading')).toBe('eager');
  });
});
