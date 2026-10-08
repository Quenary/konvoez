import { EUserRole, type IUser } from '@konvoez/shared';
import { AppService } from '@shared/services/app.service';
import { VoiceRoomsStateService } from './voice-rooms.state';

const alice: IUser = {
  id: 1,
  username: 'alice',
  fullname: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

describe('VoiceRoomsStateService lobby revision', () => {
  let service: VoiceRoomsStateService;

  beforeEach(() => {
    service = new VoiceRoomsStateService({} as unknown as AppService);
  });

  it('starts the snapshot at revision 0 with an epoch and no rooms', () => {
    const snapshot = service.getLobbySnapshot();

    expect(snapshot.revision).toBe(0);
    expect(snapshot.epoch).toEqual(expect.any(String));
    expect(snapshot.rooms).toEqual({});
  });

  it('increments revision for every joined/left event within one epoch', () => {
    const { epoch } = service.getLobbySnapshot();

    const joined = service.createLobbyPeerJoined(5, alice);
    const left = service.createLobbyPeerLeft(5, alice.id);

    expect(joined).toEqual({ roomId: 5, user: alice, epoch, revision: 1 });
    expect(left).toEqual({ roomId: 5, userId: alice.id, epoch, revision: 2 });
    expect(service.getLobbySnapshot().revision).toBe(2);
  });

  it('uses a different epoch for every service instance', () => {
    const other = new VoiceRoomsStateService({} as unknown as AppService);

    expect(other.getLobbySnapshot().epoch).not.toBe(
      service.getLobbySnapshot().epoch,
    );
  });
});
