export enum EUserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum ERoomType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
}

export enum ESettingKey {
  ICE_SERVERS = 'ICE_SERVERS',
  INVITE_ONLY_SIGN_UP = 'INVITE_ONLY_SIGN_UP',
}

export enum ETextRoomEvent {
  JOIN = 'join',
  LEAVE = 'leave',
  MESSAGE_CREATED = 'message-created',
  MESSAGE_EDITED = 'message-edited',
  MESSAGE_DELETED = 'message-deleted',
  USER_TYPING = 'user-typing',
  ERROR = 'error',
}

export enum EVoiceRoomEvent {
  JOIN_ROOM = 'join-room',
  LEAVE_ROOM = 'leave-room',
  PEER_JOINED = 'peer-joined',
  PEER_LEFT = 'peer-left',
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
  CONSUME = 'consume',
  CONSUMER_CLOSED = 'consumer-closed',
  ERROR = 'error',
}
