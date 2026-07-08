import { ERoomType } from '@konvoez/common';

export interface IRoom {
  id: number;
  name: string;
  type: ERoomType;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IRoomCreate {
  name: string;
  type: ERoomType;
}

export interface IRoomUpdate {
  name: string;
}
