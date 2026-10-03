export const usernameMinLength = 4;
export const usernameMaxLength = 32;
export const passwordRegexp = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,64}/;
export const passwordMinLength = 12;
export const passwordMaxLength = 32;
export const fullnameMinLength = 4;
export const fullnameMaxLength = 128;
export const messageMinLength = 1;
export const messageMaxLength = 5000;
/** Preview length for OS notifications. Web Push ciphertext is capped at ~4KB. */
export const pushNotificationBodyMaxLength = 200;
export const messageListMinLimit = 1;
export const messageListMaxLimit = 1000;
export const roomNameMinLength = 1;
export const roomNameMaxLength = 64;
export const maxAvatarSize = 1024 * 1024 * 5; // 5MB
export const inviteMinTtl = 60_000; // 1 minute in ms
export const inviteMaxTtl = 24 * 60 * 60 * 1000; // 1 day in ms
export const inviteDefaultTtl = 24 * 60 * 60 * 1000; // 1 day in ms
export const passwordRecoveryCodeMinTtl = 60_000; // 1 minute in ms
export const passwordRecoveryCodeMaxTtl = 60 * 60 * 1000; // 1 hour in ms
export const passwordRecoveryCodeDefaultTtl = 10 * 60 * 1000; // 10 minutes in ms
export const passwordRecoveryCodeLength = 6;
export const passwordRecoveryRequestCooldownMs = 60_000; // 1 minute
/** Hard cap on how many files one message may reference. */
export const attachmentsMaxFilesHardLimit = 10;
/** Default for the admin setting `ATTACHMENTS_MAX_FILES_PER_MESSAGE`. */
export const attachmentsDefaultMaxFilesPerMessage = 10;
/**
 * Lower bound of the admin setting `ATTACHMENTS_MAX_FILE_SIZE`.
 * This is the smallest per-file maximum an admin can configure, not a minimum upload size.
 * A file smaller than this value is allowed.
 */
export const attachmentsMinFileSize = 1024 * 1024; // 1 MiB
/** Upper bound of the admin setting `ATTACHMENTS_MAX_FILE_SIZE`. */
export const attachmentsMaxFileSizeHardLimit = 1024 * 1024 * 1024; // 1 GiB
/** Default for the admin setting `ATTACHMENTS_MAX_FILE_SIZE`. */
export const attachmentsDefaultMaxFileSize = 50 * 1024 * 1024; // 50 MiB
/** How long an unclaimed pending upload is kept before the sweeper deletes it. */
export const attachmentsPendingTtlMs = 24 * 60 * 60 * 1000;
/** Maximum number of pending (not yet attached) uploads per user. */
export const attachmentsMaxPendingPerUser = 30;
/** sharp `limitInputPixels`. Images above this are not decoded as images. */
export const attachmentsMaxImagePixels = 50_000_000;
/** Longest side of a generated WebP thumbnail, in pixels. */
export const attachmentsThumbnailMaxSide = 1024;
/** Client-supplied poster bytes, before the server re-encodes them. */
export const attachmentsMaxPosterSize = 2 * 1024 * 1024;
/** sharp `limitInputPixels` for an untrusted client poster. */
export const attachmentsMaxPosterPixels = 4096 * 4096;
/** Largest accepted video width or height hint, in pixels. */
export const attachmentsMaxVideoSide = 16384;
/** Longest accepted video duration, in seconds (24 hours). */
export const attachmentsMaxVideoDurationSeconds = 86_400;
/** Animated images up to this size are shown from the original URL so they keep animating. */
export const attachmentsAnimatedInlineMaxSize = 8 * 1024 * 1024;
/** Maximum stored length of a sanitised original file name. */
export const attachmentFileNameMaxLength = 255;
export const INLINE_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;
export const INLINE_VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;
export const INLINE_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
] as const;
