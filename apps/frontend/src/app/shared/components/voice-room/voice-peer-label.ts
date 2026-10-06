import { IUser } from '@konvoez/shared';

/** Full name when it is present and different from the username. */
export function distinctFullname(
  peer: Pick<IUser, 'fullname' | 'username'>,
): string | null {
  if (peer.fullname && peer.fullname !== peer.username) {
    return peer.fullname;
  }
  return null;
}
