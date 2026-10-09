import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageReactionsBarComponent } from './chat-message-reactions-bar.component';
import { provideTranslateService } from '@ngx-translate/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ChatMessageReactionsBarComponent', () => {
  let component: ChatMessageReactionsBarComponent;
  let fixture: ComponentFixture<ChatMessageReactionsBarComponent>;

  beforeEach(async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    await TestBed.configureTestingModule({
      imports: [ChatMessageReactionsBarComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatMessageReactionsBarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('reactions', []);
    fixture.componentRef.setInput('currentUserId', 1);
    fixture.detectChanges();
  });

  it('should render 10 quick emojis by default in compact mode', () => {
    const el: HTMLElement = fixture.nativeElement;
    const emojiButtons = el.querySelectorAll('.reaction-item');
    expect(emojiButtons.length).toBe(10);
    expect(emojiButtons[0].textContent?.trim()).toBe('👍');
  });

  it('should emit react when an emoji is clicked', () => {
    const spy = vi.fn();
    component.react.subscribe(spy);

    const el: HTMLElement = fixture.nativeElement;
    const emojiButton = el.querySelector<HTMLButtonElement>('.reaction-item');
    emojiButton?.click();

    expect(spy).toHaveBeenCalledWith('👍');
  });

  it('should toggle expanded mode when expand button is clicked', () => {
    const el: HTMLElement = fixture.nativeElement;
    const expandBtn = el.querySelector<HTMLButtonElement>(
      '.reaction-expand-btn',
    );
    expandBtn?.click();
    fixture.detectChanges();

    const picker = el.querySelector('.reactions-picker');
    expect(picker).not.toBeNull();

    const gridButtons = el.querySelectorAll('.emoji-grid-btn');
    expect(gridButtons.length).toBeGreaterThan(50);
  });

  it('should mark emoji as active if reacted by current user', () => {
    fixture.componentRef.setInput('reactions', [
      { emoji: '👍', count: 1, userIds: [1] },
    ]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const activeItem = el.querySelector('.reaction-item--active');
    expect(activeItem).not.toBeNull();
    expect(activeItem?.textContent?.trim()).toBe('👍');
  });
});
