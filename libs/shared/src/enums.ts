export enum EUserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum EPermission {
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  MANAGE_INVITES = 'MANAGE_INVITES',
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_ROLES = 'MANAGE_ROLES',
  MANAGE_ROOMS = 'MANAGE_ROOMS',
  SEND_MESSAGES = 'SEND_MESSAGES',
  MODERATE_MESSAGES = 'MODERATE_MESSAGES',
  USE_ATTACHMENTS = 'USE_ATTACHMENTS',
  CONNECT_VOICE = 'CONNECT_VOICE',
}

export const DEFAULT_USER_PERMISSIONS: readonly EPermission[] = [
  EPermission.SEND_MESSAGES,
  EPermission.CONNECT_VOICE,
  EPermission.USE_ATTACHMENTS,
] as const;

export const DEFAULT_MODERATOR_PERMISSIONS: readonly EPermission[] = [
  EPermission.SEND_MESSAGES,
  EPermission.CONNECT_VOICE,
  EPermission.USE_ATTACHMENTS,
  EPermission.MODERATE_MESSAGES,
  EPermission.MANAGE_ROOMS,
] as const;

export const ALL_PERMISSIONS: readonly EPermission[] = Object.values(
  EPermission,
) as EPermission[];

export enum ERoomType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
}

export enum EVoiceSessionType {
  GROUP_ROOM = 'GROUP_ROOM',
  DIRECT_CALL = 'DIRECT_CALL',
}

export enum ESettingKey {
  ICE_SERVERS = 'ICE_SERVERS',
  INVITE_ONLY_SIGN_UP = 'INVITE_ONLY_SIGN_UP',
  PASSWORD_RECOVERY_CODE_TTL = 'PASSWORD_RECOVERY_CODE_TTL',
  ATTACHMENTS_ENABLED = 'ATTACHMENTS_ENABLED',
  ATTACHMENTS_MAX_FILE_SIZE = 'ATTACHMENTS_MAX_FILE_SIZE',
  ATTACHMENTS_MAX_FILES_PER_MESSAGE = 'ATTACHMENTS_MAX_FILES_PER_MESSAGE',
  ATTACHMENTS_STRIP_IMAGE_METADATA = 'ATTACHMENTS_STRIP_IMAGE_METADATA',
}

export enum EAttachmentKind {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  FILE = 'FILE',
}

export enum ETextRoomEvent {
  JOIN = 'join',
  LEAVE = 'leave',
  MESSAGE_CREATED = 'message-created',
  MESSAGE_EDITED = 'message-edited',
  MESSAGE_DELETED = 'message-deleted',
  MESSAGE_REACTION_UPDATED = 'message-reaction-updated',
  USER_TYPING = 'user-typing',
  ERROR = 'error',
}

export enum EVoiceRoomEvent {
  JOIN_ROOM = 'join-room',
  LEAVE_ROOM = 'leave-room',
  PEER_JOINED = 'peer-joined',
  PEER_LEFT = 'peer-left',
  /** Server ended the session (e.g. group room deleted). */
  ROOM_CLOSED = 'room-closed',
  /**
   * Get existing peers of all rooms to sync frontend state
   */
  GET_ALL_PEERS = 'get-all-peers',
  /**
   * Existing peers in current room.
   * Emits room's users to joined user and triggers initial signaling.
   */
  PEERS_ON_JOIN = 'peers-on-join',
  GET_RTP_CAPABILITIES = 'get-rtp-capabilities',
  CREATE_TRANSPORT = 'create-transport',
  CONNECT_TRANSPORT = 'connect-transport',
  PRODUCE = 'produce',
  PRODUCER_CREATED = 'producer-created',
  PRODUCER_CLOSED = 'producer-closed',
  CLOSE_PRODUCER = 'close-producer',
  CONSUME = 'consume',
  CLOSE_CONSUMER = 'close-consumer',
  CONSUMER_CLOSED = 'consumer-closed',
  SET_MUTE_STATE = 'set-mute-state',
  PEER_MUTE_CHANGED = 'peer-mute-changed',
  ERROR = 'error',
}

export enum EDirectCallEvent {
  CALL_INITIATE = 'call:initiate',
  CALL_INCOMING = 'call:incoming',
  CALL_ACCEPT = 'call:accept',
  CALL_ACCEPTED = 'call:accepted',
  CALL_REJECT = 'call:reject',
  CALL_REJECTED = 'call:rejected',
  CALL_HANGUP = 'call:hangup',
  CALL_ENDED = 'call:ended',
  CALL_ANSWERED_ELSEWHERE = 'call:answered-elsewhere',
  CALL_GET_ACTIVE = 'call:get-active',
}

export enum EEntitySyncEvent {
  USER_CREATED = 'user-created',
  USER_UPDATED = 'user-updated',
  USER_DELETED = 'user-deleted',
  ROOM_CREATED = 'room-created',
  ROOM_UPDATED = 'room-updated',
  ROOM_DELETED = 'room-deleted',
  VOICE_ROOM_PEER_JOINED = 'voice-room-peer-joined',
  VOICE_ROOM_PEER_LEFT = 'voice-room-peer-left',
  VOICE_ROOM_PEER_MUTED = 'voice-room-peer-muted',
  USER_PRESENCE_CHANGED = 'user-presence-changed',
  USER_PRESENCE_SNAPSHOT = 'user-presence-snapshot',
  ERROR = 'error',
}

export enum ENotificationsEvent {
  NOTIFICATION = 'notification',
}
