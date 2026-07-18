export namespace SettingsCommon {
  export enum EKey {
    ICE_SERVERS = 'ICE_SERVERS',
  }
  export type Type = {
    [EKey.ICE_SERVERS]: RTCIceServer[];
  };
  export type TypeUnion = {
    [K in EKey]: Type[K];
  }[EKey];
  export interface ISetting<K extends EKey> {
    id: number;
    key: K;
    value: Type[K];
    createdAt: Date;
    updatedAt: Date | null;
  }
  export interface ISettingUpdate<K extends EKey> {
    value: Type[K];
  }
}
