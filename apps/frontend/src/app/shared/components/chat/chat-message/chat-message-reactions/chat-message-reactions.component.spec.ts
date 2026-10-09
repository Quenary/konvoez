import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageReactionsComponent } from './chat-message-reactions.component';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { UsersStore } from '@core/stores/users.store';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ChatMessageReactionsComponent', () => {
  let component: ChatMessageReactionsComponent;
  let fixture: ComponentFixture<ChatMessageReactionsComponent>;
  let translateService: TranslateService;

  const mockUsersStore = {
    entityMap: signal({
      1: { id: 1, username: 'alice' },
      2: { id: 2, username: 'bob' },
    }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatMessageReactionsComponent],
      providers: [
        provideTranslateService(),
        { provide: UsersStore, useValue: mockUsersStore },
      ],
    }).compileComponents();

    translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en', {
      REACTIONS: {
        YOU: 'You',
        UNKNOWN_USER: 'User #{{ id }}',
      },
    });
    translateService.setTranslation('ru', {
      REACTIONS: {
        YOU: 'Вы',
        UNKNOWN_USER: 'Пользователь #{{ id }}',
      },
    });
    translateService.use('en');

    fixture = TestBed.createComponent(ChatMessageReactionsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('reactions', [
      { emoji: '👍', count: 2, userIds: [1, 2] },
      { emoji: '🔥', count: 1, userIds: [2] },
    ]);
    fixture.componentRef.setInput('currentUserId', 1);
    fixture.detectChanges();
  });

  it('should render reaction pills with emoji and count', () => {
    const el: HTMLElement = fixture.nativeElement;
    const pills = el.querySelectorAll('.reaction-pill');
    expect(pills.length).toBe(2);

    expect(
      pills[0].querySelector('.reaction-pill-emoji')?.textContent?.trim(),
    ).toBe('👍');
    expect(
      pills[0].querySelector('.reaction-pill-count')?.textContent?.trim(),
    ).toBe('2');
  });

  it('should mark pill as active if current user reacted', () => {
    const el: HTMLElement = fixture.nativeElement;
    const pills = el.querySelectorAll('.reaction-pill');

    expect(pills[0].classList.contains('reaction-pill--active')).toBe(true);
    expect(pills[1].classList.contains('reaction-pill--active')).toBe(false);
  });

  it('should emit react when pill is clicked', () => {
    const spy = vi.fn();
    component.react.subscribe(spy);

    const el: HTMLElement = fixture.nativeElement;
    const pill = el.querySelector<HTMLButtonElement>('.reaction-pill');
    pill?.click();

    expect(spy).toHaveBeenCalledWith('👍');
  });

  it('should compute reaction view models with correct tooltips and active state', () => {
    const vms = component['reactionViewModels']();
    expect(vms.length).toBe(2);
    expect(vms[0].isReactedByMe).toBe(true);
    expect(vms[0].tooltip).toContain('bob');
    expect(vms[1].isReactedByMe).toBe(false);
  });

  it('should format unknown user using translation template', () => {
    fixture.componentRef.setInput('reactions', [
      { emoji: '👍', count: 1, userIds: [99] },
    ]);
    fixture.componentRef.setInput('currentUserId', 1);
    fixture.detectChanges();

    const vms = component['reactionViewModels']();
    expect(vms[0].tooltip).toBe('User #99');
  });

  it('should react to language changes in tooltip', () => {
    expect(component['reactionViewModels']()[0].tooltip).toContain('You');

    translateService.use('ru');
    fixture.detectChanges();

    expect(component['reactionViewModels']()[0].tooltip).toContain('Вы');
  });
});
