import { z } from 'zod';

export enum ESettingKey {
  ICE_SERVERS = 'ICE_SERVERS',
}

export type TSettingValueMap = {
  [ESettingKey.ICE_SERVERS]: RTCIceServer[];
};

export interface ISetting<K extends ESettingKey> {
  id: number;
  key: K;
  value: TSettingValueMap[K];
  createdAt: Date;
  updatedAt: Date | null | undefined;
}

export type TSetting = {
  [K in ESettingKey]: ISetting<K>;
}[ESettingKey];

export interface ISettingUpdate<K extends ESettingKey> {
  value: TSettingValueMap[K];
}

export const settingsUpdateSchema = z.object({
  value: z.unknown(),
});

export const settingSchema = z.object({
  id: z.number().int(),
  key: z.enum(ESettingKey),
  value: z.unknown(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullish(),
});
