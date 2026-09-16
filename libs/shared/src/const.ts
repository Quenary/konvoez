export const usernameMinLength = 4;
export const usernameMaxLength = 32;
export const passwordRegexp = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,64}/;
export const passwordMinLength = 12;
export const passwordMaxLength = 32;
export const fullnameMinLength = 4;
export const fullnameMaxLength = 128;
export const messageMinLength = 1;
export const messageMaxLength = 5000;
export const messageListMinLimit = 1;
export const messageListMaxLimit = 1000;
export const roomNameMinLength = 1;
export const roomNameMaxLength = 64;
export const maxAvatarSize = 1024 * 1024 * 1; // 10MB
export const inviteMinTtl = 60_000; // 1 minute in ms
export const inviteMaxTtl = 24 * 60 * 60 * 1000; // 1 day in ms
export const inviteDefaultTtl = 24 * 60 * 60 * 1000; // 1 day in ms
