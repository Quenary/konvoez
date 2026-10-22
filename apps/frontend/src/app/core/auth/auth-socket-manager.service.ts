import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { ESocketEvent } from '@konvoez/shared';
import { distinctUntilChanged, finalize } from 'rxjs';
import type { Socket } from 'socket.io-client';
import { AppResumeService } from '@core/services/app-resume.service';
import { DesktopBridgeService } from '@core/desktop/desktop-bridge.service';
import { EntitySyncSocketToken } from '@core/tokens/entity-sync-socket.token';
import { NotificationsSocketToken } from '@core/tokens/notifications-socket.token';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { VoiceRoomSocketToken } from '@core/tokens/voice-room-socket.token';
import { selectIsAuthorized } from './auth.selectors';
import { TokenRefreshService } from './token-refresh.service';

const STABLE_CONNECTION_MS = 5_000;
/** Liveness ping on resume; no ack in time means the socket is a zombie. */
export const RESUME_PING_TIMEOUT_MS = 3_000;

interface SocketEntry {
  socket: Socket;
  enabled: boolean;
  attempt: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  stableTimer?: ReturnType<typeof setTimeout>;
  handlersBound: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthSocketManager {
  private readonly store = inject(Store);
  private readonly tokenRefreshService = inject(TokenRefreshService);
  private readonly voiceRoomSocket = inject(VoiceRoomSocketToken);
  private readonly textRoomSocket = inject(TextRoomSocketToken);
  private readonly entitySyncSocket = inject(EntitySyncSocketToken);
  private readonly notificationsSocket = inject(NotificationsSocketToken);
  private readonly desktopBridgeService = inject(DesktopBridgeService);
  private readonly appResumeService = inject(AppResumeService);
  private readonly destroyRef = inject(DestroyRef);

  private authorized = false;
  private stopped = false;
  private started = false;

  private readonly entries: SocketEntry[];

  constructor() {
    const isDesktop = this.desktopBridgeService.isDesktop;
    this.entries = [
      {
        socket: this.voiceRoomSocket,
        enabled: true,
        attempt: 0,
        handlersBound: false,
      },
      {
        socket: this.textRoomSocket,
        enabled: true,
        attempt: 0,
        handlersBound: false,
      },
      {
        socket: this.entitySyncSocket,
        enabled: true,
        attempt: 0,
        handlersBound: false,
      },
      {
        socket: this.notificationsSocket,
        enabled: isDesktop,
        attempt: 0,
        handlersBound: false,
      },
    ];
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    for (const entry of this.entries) {
      if (entry.enabled) {
        this.bindHandlers(entry);
      }
    }

    this.appResumeService.resume$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkSocketsOnResume();
      });

    this.store
      .select(selectIsAuthorized)
      .pipe(
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.stopped = true;
          this.clearAllTimers();
          for (const entry of this.entries) {
            if (entry.enabled) {
              entry.socket.disconnect();
            }
          }
        }),
      )
      .subscribe((isAuthorized) => {
        this.authorized = isAuthorized;
        if (isAuthorized) {
          this.stopped = false;
          this.clearAllTimers();
          for (const entry of this.entries) {
            entry.attempt = 0;
            if (entry.enabled) {
              entry.socket.connect();
            }
          }
        } else {
          this.stopped = true;
          this.clearAllTimers();
          for (const entry of this.entries) {
            if (entry.enabled) {
              entry.socket.disconnect();
            }
          }
        }
      });
  }

  private bindHandlers(entry: SocketEntry): void {
    if (entry.handlersBound) {
      return;
    }
    entry.handlersBound = true;

    const { socket } = entry;

    socket.on('disconnect', (reason: string) => {
      this.clearStableTimer(entry);
      if (reason === 'io server disconnect' && this.authorized) {
        this.scheduleReconnect(entry);
      }
    });

    socket.on('connect_error', (err: Error) => {
      if (err.message === 'Unauthorized' && this.authorized) {
        this.scheduleReconnect(entry);
      }
    });

    socket.on('connect', () => {
      this.clearStableTimer(entry);
      entry.stableTimer = setTimeout(() => {
        entry.stableTimer = undefined;
        entry.attempt = 0;
      }, STABLE_CONNECTION_MS);
    });
  }

  private scheduleReconnect(entry: SocketEntry): void {
    if (this.stopped || !this.authorized) {
      return;
    }

    if (entry.reconnectTimer !== undefined) {
      clearTimeout(entry.reconnectTimer);
    }

    const delay = Math.min(1000 * 2 ** entry.attempt++, 30_000);
    entry.reconnectTimer = setTimeout(() => {
      entry.reconnectTimer = undefined;
      this.onReconnectTimer(entry);
    }, delay);
  }

  private onReconnectTimer(entry: SocketEntry): void {
    if (this.stopped || !this.authorized || entry.socket.connected) {
      return;
    }

    void this.tokenRefreshService.refresh().then((ok) => {
      if (!ok || this.stopped || !this.authorized || entry.socket.connected) {
        return;
      }
      entry.socket.connect();
    });
  }

  /**
   * After sleep a socket may look connected while its transport is dead. Ping
   * live sockets and recycle silent ones; reconnect dropped ones now instead of
   * waiting for the backoff timer.
   */
  private checkSocketsOnResume(): void {
    if (this.stopped || !this.authorized) {
      return;
    }
    for (const entry of this.entries) {
      if (!entry.enabled) {
        continue;
      }
      const { socket } = entry;
      if (!socket.connected) {
        if (entry.reconnectTimer !== undefined) {
          clearTimeout(entry.reconnectTimer);
          entry.reconnectTimer = undefined;
        }
        entry.attempt = 0;
        this.onReconnectTimer(entry);
        continue;
      }
      socket
        .timeout(RESUME_PING_TIMEOUT_MS)
        .emitWithAck(ESocketEvent.PING)
        .catch(() => {
          if (this.stopped || !this.authorized || !socket.connected) {
            return;
          }
          socket.disconnect();
          socket.connect();
        });
    }
  }

  private clearStableTimer(entry: SocketEntry): void {
    if (entry.stableTimer !== undefined) {
      clearTimeout(entry.stableTimer);
      entry.stableTimer = undefined;
    }
  }

  private clearAllTimers(): void {
    for (const entry of this.entries) {
      if (entry.reconnectTimer !== undefined) {
        clearTimeout(entry.reconnectTimer);
        entry.reconnectTimer = undefined;
      }
      this.clearStableTimer(entry);
    }
  }
}
