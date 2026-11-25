import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserAvatarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAvatarComponent);
    element = fixture.nativeElement;
  });

  it('renders initials immediately while img is loading and hides them after load', () => {
    fixture.componentRef.setInput('username', 'alice');
    fixture.componentRef.setInput('fullname', 'Alice Wonderland');
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/alice.png');
    fixture.detectChanges();

    const img = element.querySelector('img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/alice.png');
    expect(img?.getAttribute('alt')).toBe('alice');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.classList.contains('loaded')).toBe(false);
    expect(element.classList.contains('loaded')).toBe(false);

    const spanWhileLoading = element.querySelector('span');
    expect(spanWhileLoading?.textContent?.trim()).toBe('AW');
    expect(spanWhileLoading?.style.color).toBeTruthy();

    img?.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(img?.classList.contains('loaded')).toBe(true);
    expect(element.classList.contains('loaded')).toBe(true);
    expect(element.querySelector('span')).toBeNull();
  });

  it('reveals already-cached img when complete and naturalWidth > 0', () => {
    fixture.componentRef.setInput('username', 'alice');
    fixture.componentRef.setInput('fullname', 'Alice Wonderland');
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/alice.png');
    fixture.detectChanges();

    const img = element.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    Object.defineProperty(img, 'naturalWidth', {
      value: 128,
      configurable: true,
    });
    fixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/cached.png',
    );
    fixture.detectChanges();

    expect(img.classList.contains('loaded')).toBe(true);
    expect(element.classList.contains('loaded')).toBe(true);
    expect(element.querySelector('span')).toBeNull();
  });

  it('falls back to colored initials on image error and resets state when avatarUrl changes', () => {
    fixture.componentRef.setInput('username', 'alice');
    fixture.componentRef.setInput('fullname', 'Alice Wonderland');
    fixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/broken.png',
    );
    fixture.detectChanges();

    const brokenImg = element.querySelector('img');
    expect(brokenImg).toBeTruthy();

    brokenImg?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(element.querySelector('img')).toBeNull();
    expect(element.classList.contains('loaded')).toBe(false);
    const fallbackSpan = element.querySelector('span');
    expect(fallbackSpan?.textContent?.trim()).toBe('AW');
    expect(fallbackSpan?.style.color).toBeTruthy();

    fixture.componentRef.setInput('avatarUrl', 'https://example.com/fixed.png');
    fixture.detectChanges();

    const retryImg = element.querySelector('img');
    expect(retryImg).toBeTruthy();
    expect(retryImg?.getAttribute('src')).toBe('https://example.com/fixed.png');
    expect(retryImg?.classList.contains('loaded')).toBe(false);
    expect(element.querySelector('span')?.textContent?.trim()).toBe('AW');

    retryImg?.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(retryImg?.classList.contains('loaded')).toBe(true);
    expect(element.querySelector('span')).toBeNull();

    fixture.componentRef.setInput('avatarUrl', 'https://example.com/next.png');
    fixture.detectChanges();

    const nextImg = element.querySelector('img');
    expect(nextImg?.classList.contains('loaded')).toBe(false);
    expect(element.classList.contains('loaded')).toBe(false);
    expect(element.querySelector('span')?.textContent?.trim()).toBe('AW');
  });

  it('supports priority mode without conflicting loading attribute', () => {
    fixture.componentRef.setInput('username', 'alice');
    fixture.componentRef.setInput('fullname', 'Alice Wonderland');
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/alice.png');
    fixture.componentRef.setInput('priority', true);
    fixture.detectChanges();

    const img = element.querySelector('img');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
    expect(img?.getAttribute('loading')).toBe('eager');
  });

  it('renders fullname initials and username color when avatarUrl is null', () => {
    fixture.componentRef.setInput('username', 'bob');
    fixture.componentRef.setInput('fullname', 'Bob Ross');
    fixture.componentRef.setInput('avatarUrl', null);
    fixture.detectChanges();

    const img = element.querySelector('img');
    expect(img).toBeNull();

    const span = element.querySelector('span');
    expect(span).toBeTruthy();
    expect(span?.textContent?.trim()).toBe('BR');
    expect(span?.style.color).toBeTruthy();
  });

  it('toggles talking class on host based on talking input', () => {
    fixture.componentRef.setInput('username', 'eve');
    fixture.componentRef.setInput('fullname', 'Eve Online');
    fixture.componentRef.setInput('avatarUrl', null);
    fixture.componentRef.setInput('talking', false);
    fixture.detectChanges();

    expect(element.classList.contains('talking')).toBe(false);

    fixture.componentRef.setInput('talking', true);
    fixture.detectChanges();

    expect(element.classList.contains('talking')).toBe(true);
  });
});
