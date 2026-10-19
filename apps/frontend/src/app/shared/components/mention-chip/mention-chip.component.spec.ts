import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MentionChipComponent } from './mention-chip.component';
import { IMentionChipVm } from './mention-chip.vm';

describe('MentionChipComponent', () => {
  let fixture: ComponentFixture<MentionChipComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MentionChipComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MentionChipComponent);
    element = fixture.nativeElement;
  });

  it('renders chip with info appearance when isMe is true', () => {
    const vm: IMentionChipVm = {
      kind: 'user',
      id: 1,
      label: '@alice',
      isMe: true,
      appearance: 'info',
      avatar: {
        kind: 'user',
        username: 'alice',
        fullname: 'Alice Wonderland',
        avatarUrl: null,
      },
    };

    fixture.componentRef.setInput('vm', vm);
    fixture.detectChanges();

    expect(element.getAttribute('data-type')).toBe('mention');
    expect(element.getAttribute('data-kind')).toBe('user');
    expect(element.getAttribute('data-id')).toBe('1');
    expect(element.classList.contains('mention-chip-me')).toBe(true);

    const chip = element.querySelector('span[tuiChip]');
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('data-size')).toBe('xs');
    expect(chip?.getAttribute('data-appearance')).toBe('info');
    expect(chip?.textContent).toContain('@alice');
  });

  it('renders chip with neutral appearance when isMe is false', () => {
    const vm: IMentionChipVm = {
      kind: 'role',
      id: 10,
      label: '@Moderator',
      isMe: false,
      appearance: 'neutral',
      avatar: {
        kind: 'role',
        name: 'Moderator',
        color: null,
      },
    };

    fixture.componentRef.setInput('vm', vm);
    fixture.detectChanges();

    expect(element.getAttribute('data-type')).toBe('mention');
    expect(element.getAttribute('data-kind')).toBe('role');
    expect(element.getAttribute('data-id')).toBe('10');
    expect(element.classList.contains('mention-chip-me')).toBe(false);

    const chip = element.querySelector('span[tuiChip]');
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('data-size')).toBe('xs');
    expect(chip?.getAttribute('data-appearance')).toBe('neutral');
    expect(chip?.textContent).toContain('@Moderator');
  });

  it('renders everyone mention with null id', () => {
    const vm: IMentionChipVm = {
      kind: 'everyone',
      id: null,
      label: '@everyone',
      isMe: true,
      appearance: 'info',
      avatar: {
        kind: 'everyone',
      },
    };

    fixture.componentRef.setInput('vm', vm);
    fixture.detectChanges();

    expect(element.getAttribute('data-type')).toBe('mention');
    expect(element.getAttribute('data-kind')).toBe('everyone');
    expect(element.getAttribute('data-id')).toBeNull();
    expect(element.textContent).toContain('@everyone');
  });
});
