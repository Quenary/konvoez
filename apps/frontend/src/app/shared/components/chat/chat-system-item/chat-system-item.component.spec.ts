import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatSystemItemComponent } from './chat-system-item.component';
import { Component } from '@angular/core';

@Component({
  imports: [ChatSystemItemComponent],
  template: `<app-chat-system-item>Projected text</app-chat-system-item>`,
})
class TestHostComponent {}

describe('ChatSystemItemComponent', () => {
  let fixture: ComponentFixture<ChatSystemItemComponent>;
  let component: ChatSystemItemComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatSystemItemComponent, TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatSystemItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render input text when provided', () => {
    fixture.componentRef.setInput('text', 'Unread messages');
    fixture.detectChanges();

    const textEl = fixture.nativeElement.querySelector(
      '.chat-system-item-text',
    );
    expect(textEl?.textContent?.trim()).toBe('Unread messages');
  });

  it('should project content when text input is not provided', () => {
    const hostFixture = TestBed.createComponent(TestHostComponent);
    hostFixture.detectChanges();

    const textEl = hostFixture.nativeElement.querySelector(
      '.chat-system-item-text',
    );
    expect(textEl?.textContent?.trim()).toBe('Projected text');
  });
});
