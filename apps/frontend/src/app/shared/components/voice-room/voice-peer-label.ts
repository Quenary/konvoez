import { IUserSafe } from '@konvoez/shared';

/** Full name when it is present and different from the username. */
export function distinctFullname(
  peer: Pick<IUserSafe, 'fullname' | 'username'>,
): string | null {
  if (peer.fullname && peer.fullname !== peer.username) {
    return peer.fullname;
  }
  return null;
}
