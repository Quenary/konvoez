import { ERoomType } from '@konvoez/shared';

export interface IRoom {
  id: number;
  name: string;
  type: ERoomType;
  avatar: string | null | undefined;
  avatarUrl: string | null | undefined;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IRoomCreate {
  name: string;
  type: ERoomType;
  avatar?: string;
}

export interface IRoomUpdate {
  name: string;
  avatar?: string | null | undefined;
}
