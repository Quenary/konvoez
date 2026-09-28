import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

export type TDirectCallStatus = 'ringing' | 'active';

export type TDirectCallRecord = {
  callId: string;
  callerId: number;
  recipientId: number;
  status: TDirectCallStatus;
};

@Injectable()
export class DirectCallsStateService {
  private readonly calls = new Map<string, TDirectCallRecord>();

  public create(callerId: number, recipientId: number): TDirectCallRecord {
    const existing = this.findActiveBetween(callerId, recipientId);
    if (existing?.status === 'ringing') {
      return existing;
    }
    if (existing?.status === 'active') {
      // Caller should use CALL_GET_ACTIVE / rejoin instead of initiate
      return existing;
    }

    const record: TDirectCallRecord = {
      callId: uuidv7(),
      callerId,
      recipientId,
      status: 'ringing',
    };
    this.calls.set(record.callId, record);
    return record;
  }

  public get(callId: string): TDirectCallRecord | undefined {
    return this.calls.get(callId);
  }

  public accept(
    callId: string,
    recipientId: number,
  ): TDirectCallRecord | undefined {
    const call = this.calls.get(callId);
    if (
      !call ||
      call.recipientId !== recipientId ||
      call.status !== 'ringing'
    ) {
      return undefined;
    }
    call.status = 'active';
    return call;
  }

  public cancel(callId: string): TDirectCallRecord | undefined {
    const call = this.calls.get(callId);
    if (!call) {
      return undefined;
    }
    this.calls.delete(callId);
    return call;
  }

  public end(callId: string): TDirectCallRecord | undefined {
    return this.cancel(callId);
  }

  public findActiveBetween(
    userA: number,
    userB: number,
  ): TDirectCallRecord | undefined {
    for (const call of this.calls.values()) {
      const isPair =
        (call.callerId === userA && call.recipientId === userB) ||
        (call.callerId === userB && call.recipientId === userA);
      if (isPair) {
        return call;
      }
    }
    return undefined;
  }

  public findActiveForUser(userId: number): TDirectCallRecord | undefined {
    for (const call of this.calls.values()) {
      if (this.isParticipant(call, userId) && call.status === 'active') {
        return call;
      }
    }
    return undefined;
  }

  public isParticipant(call: TDirectCallRecord, userId: number): boolean {
    return call.callerId === userId || call.recipientId === userId;
  }
}
