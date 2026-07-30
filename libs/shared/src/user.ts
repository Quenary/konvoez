import { EUserRole } from './enums';

/**
 * User post request body
 */
export interface IUserCreate {
  username: string;
  password: string;
  fullname: string;
  email: string;
}
/**
 * User patch request body
 */
export interface IUserUpdate extends Partial<IUserCreate> {
  role?: EUserRole;
  avatar?: string;
}
/**
 * User get response body
 */
export interface IUser {
  id: number;
  username: string;
  fullname: string;
  email: string;
  role: EUserRole;
  avatar: string | null | undefined;
  avatarUrl: string | null | undefined;
  createdAt: Date;
  updatedAt: Date | null | undefined;
}
