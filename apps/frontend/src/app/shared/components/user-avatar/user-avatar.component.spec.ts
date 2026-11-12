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

  it('renders img when avatarUrl is provided', () => {
    fixture.componentRef.setInput('username', 'alice');
    fixture.componentRef.setInput('fullname', 'Alice Wonderland');
    fixture.componentRef.setInput('avatarUrl', 'https://example.com/alice.png');
    fixture.detectChanges();

    const img = element.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/alice.png');
    expect(img?.getAttribute('alt')).toBe('alice');
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
