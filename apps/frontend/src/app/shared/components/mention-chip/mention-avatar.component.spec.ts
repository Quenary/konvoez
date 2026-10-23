import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MentionAvatarComponent } from './mention-avatar.component';
import { icons } from '@constants';

describe('MentionAvatarComponent', () => {
  let fixture: ComponentFixture<MentionAvatarComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MentionAvatarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MentionAvatarComponent);
    element = fixture.nativeElement;
  });

  it('renders user avatar with img when avatarUrl is present', () => {
    fixture.componentRef.setInput('avatar', {
      kind: 'user',
      username: 'alice',
      fullname: 'Alice Wonderland',
      avatarUrl: 'https://example.com/avatar.png',
    });
    fixture.detectChanges();

    const img = element.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/avatar.png');
  });

  it('renders user avatar with initials and auto color when avatarUrl is null', () => {
    fixture.componentRef.setInput('avatar', {
      kind: 'user',
      username: 'bob',
      fullname: 'Bob Ross',
      avatarUrl: null,
    });
    fixture.detectChanges();

    const img = element.querySelector('img');
    expect(img).toBeNull();
    const userAvatar = element.querySelector('app-user-avatar');
    expect(userAvatar).toBeTruthy();
    expect(userAvatar?.textContent?.trim()).toBe('BR');
  });

  it('renders role avatar with explicit color', () => {
    fixture.componentRef.setInput('avatar', {
      kind: 'role',
      name: 'Admin',
      color: '#ff0000',
    });
    fixture.detectChanges();

    const roleSpan = element.querySelector('span[tuiAvatar]');
    expect(roleSpan).toBeTruthy();
    expect(roleSpan?.textContent?.trim()).toBe('A');
    expect((roleSpan as HTMLElement)?.style.background).toBe('rgb(255, 0, 0)');
  });

  it('renders role avatar falling back to auto color when color is null', () => {
    fixture.componentRef.setInput('avatar', {
      kind: 'role',
      name: 'Moderator',
      color: null,
    });
    fixture.detectChanges();

    const roleSpan = element.querySelector('span[tuiAvatar]');
    expect(roleSpan).toBeTruthy();
    expect(roleSpan?.textContent?.trim()).toBe('M');
    expect((roleSpan as HTMLElement)?.style.background).toBeTruthy();
  });

  it('renders tui-icon for everyone', () => {
    fixture.componentRef.setInput('avatar', {
      kind: 'everyone',
    });
    fixture.detectChanges();

    const icon = element.querySelector('tui-icon');
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute('icon')).toBe(icons.users);
  });

  it('renders nothing for unknown', () => {
    fixture.componentRef.setInput('avatar', {
      kind: 'unknown',
    });
    fixture.detectChanges();

    expect(element.children.length).toBe(0);
    expect(element.textContent?.trim()).toBe('');
  });
});
