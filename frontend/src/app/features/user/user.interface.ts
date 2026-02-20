import { EUserRole } from './user.enum';

export interface ICreateUser {
  username: string;
  password: string;
}

export interface IUpdateUser {
  username?: string;
  password?: string;
  role?: EUserRole;
}

export interface IGetUser {
  id: number;
  username: string;
  role: EUserRole;
  createdAt: Date;
  updatedAt?: Date;
}
