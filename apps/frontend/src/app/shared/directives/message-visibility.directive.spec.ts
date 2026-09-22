import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageReadQueueService } from '@features/text-room/message-read-queue.service';
import { MessageVisibilityDirective } from './message-visibility.directive';

@Component({
  selector: 'app-message-visibility-host',
  imports: [MessageVisibilityDirective],
  template: `<div [appMessageVisibility]="messageId()"></div>`,
})
class HostComponent {
  readonly messageId = signal<string | null>('msg-1');
}

describe('MessageVisibilityDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let readQueue: { enqueue: ReturnType<typeof vi.fn> };
  let observerCallback: IntersectionObserverCallback;
  let observer: {
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    observer = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
    class MockIntersectionObserver {
      observe = observer.observe;
      unobserve = observer.unobserve;
      disconnect = observer.disconnect;

      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    readQueue = { enqueue: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: MessageReadQueueService, useValue: readQueue }],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('should enqueue the message id once it is mostly visible', () => {
    observerCallback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    );

    expect(readQueue.enqueue).toHaveBeenCalledWith('msg-1');
    expect(observer.unobserve).toHaveBeenCalled();
  });

  it('should not enqueue when the bound id is null', () => {
    fixture.componentInstance.messageId.set(null);
    fixture.detectChanges();

    observerCallback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    );

    expect(readQueue.enqueue).not.toHaveBeenCalled();
  });

  it('should disconnect the observer on destroy', () => {
    fixture.destroy();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
