import { DirectCallsStateService } from './direct-calls.state';

describe('DirectCallsStateService', () => {
  let service: DirectCallsStateService;

  beforeEach(() => {
    service = new DirectCallsStateService();
  });

  it('creates a ringing call', () => {
    const call = service.create(1, 2);

    expect(call.callerId).toBe(1);
    expect(call.recipientId).toBe(2);
    expect(call.status).toBe('ringing');
    expect(call.callId).toBeTruthy();
  });

  it('reuses an existing ringing call between the same pair', () => {
    const first = service.create(1, 2);
    const second = service.create(1, 2);

    expect(second.callId).toBe(first.callId);
    expect(second.status).toBe('ringing');
  });

  it('accepts a ringing call', () => {
    const call = service.create(1, 2);
    const accepted = service.accept(call.callId, 2);

    expect(accepted?.status).toBe('active');
    expect(service.get(call.callId)?.status).toBe('active');
  });

  it('rejects accept from the wrong user', () => {
    const call = service.create(1, 2);
    expect(service.accept(call.callId, 1)).toBeUndefined();
  });

  it('cancels a call and removes it from the registry', () => {
    const call = service.create(1, 2);
    service.cancel(call.callId);
    expect(service.get(call.callId)).toBeUndefined();
  });

  it('finds an active call between two users in either order', () => {
    const call = service.create(1, 2);
    service.accept(call.callId, 2);

    expect(service.findActiveBetween(2, 1)?.callId).toBe(call.callId);
  });

  it('ends an active call', () => {
    const call = service.create(1, 2);
    service.accept(call.callId, 2);
    service.end(call.callId);

    expect(service.get(call.callId)).toBeUndefined();
    expect(service.findActiveBetween(1, 2)).toBeUndefined();
  });

  it('checks participation', () => {
    const call = service.create(1, 2);
    expect(service.isParticipant(call, 1)).toBe(true);
    expect(service.isParticipant(call, 2)).toBe(true);
    expect(service.isParticipant(call, 3)).toBe(false);
  });

  it('finds an active call for a participant without the other user id', () => {
    const call = service.create(1, 2);
    service.accept(call.callId, 2);

    expect(service.findActiveForUser(1)?.callId).toBe(call.callId);
    expect(service.findActiveForUser(2)?.callId).toBe(call.callId);
    expect(service.findActiveForUser(3)).toBeUndefined();
  });

  it('ignores ringing calls when finding active for a user', () => {
    service.create(1, 2);
    expect(service.findActiveForUser(1)).toBeUndefined();
  });
});
