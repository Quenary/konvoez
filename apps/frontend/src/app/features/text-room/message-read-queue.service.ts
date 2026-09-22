import { inject, Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TextRoomApiService } from './text-room-api.service';

@Injectable({
  providedIn: 'root',
})
export class MessageReadQueueService implements OnDestroy {
  private readonly textRoomApiService = inject(TextRoomApiService);

  private readonly pendingIds = new Set<string>();
  private readonly trigger$ = new Subject<void>();
  private readonly subscription: Subscription;

  constructor() {
    this.subscription = this.trigger$
      .pipe(debounceTime(800))
      .subscribe(() => this.flush());
  }

  enqueue(messageId: string): void {
    this.pendingIds.add(messageId);
    this.trigger$.next();
  }

  reset(): void {
    this.pendingIds.clear();
  }

  private flush(): void {
    if (this.pendingIds.size === 0) return;
    const ids = [...this.pendingIds];
    this.pendingIds.clear();
    this.textRoomApiService.markRead(ids).subscribe();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.trigger$.complete();
  }
}
