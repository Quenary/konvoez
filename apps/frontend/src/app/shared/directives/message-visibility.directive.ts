import {
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MessageReadQueueService } from '@features/text-room/message-read-queue.service';

/**
 * Tracks whether a message element has become visible in the viewport.
 * When at least 50% of the element is visible, the message ID is enqueued
 * for the read-receipt batch request.
 *
 * Apply only to messages that the current user did NOT send.
 */
@Directive({
  selector: '[appMessageVisibility]',
})
export class MessageVisibilityDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly readQueue = inject(MessageReadQueueService);

  /** The message UUID to enqueue when the element becomes visible. Pass null to disable. */
  readonly appMessageVisibility = input<string | null>(null);

  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = this.appMessageVisibility();
            if (id) {
              this.readQueue.enqueue(id);
            }
            // Once seen, stop observing
            this.observer?.unobserve(this.el.nativeElement);
          }
        }
      },
      { threshold: 0.5 },
    );

    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
