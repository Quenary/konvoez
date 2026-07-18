import { EUserRole } from './enums';

export namespace UserCommon {
  export interface IUser {
    id: number;
    username: string;
    role: EUserRole;
    avatar: string | null;
    createdAt: Date;
    updatedAt: Date | null;
  }
}
