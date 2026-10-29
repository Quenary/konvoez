/**
 * List of supported locales
 */
export const supportedLocales = [
  'ru',
  'de',
  'fr',
  'ja',
  'it',
  'es',
  'zh',
  'en',
];

/**
 * List of shared icons
 * @see https://lucide.dev/icons
 */
export const icons = {
  /* Add buttons */
  add: '@tui.plus',
  /* Insert operations */
  create: '@tui.save-plus',
  /* Update operations */
  save: '@tui.save',
  delete: '@tui.trash',
  refresh: '@tui.refresh-cw',
  direct: '@tui.messages-square',
  settings: '@tui.settings',
  'settings-profile': '@tui.user-pen',
  'settings-security': '@tui.shield-user',
  'settings-devices': '@tui.file-headphone',
  'settings-notifications': '@tui.bell-ring',
  'settings-invites': '@tui.mail',
  'settings-roles': '@tui.user-cog',
  'settings-users': '@tui.users',
  'settings-admin': '@tui.shield',
  /* Navigation / shell */
  home: '@tui.home',
  info: '@tui.info',
  copy: '@tui.copy',
  download: '@tui.download',
  'chevron-left': '@tui.chevron-left',
  'chevron-right': '@tui.chevron-right',
  'chevron-up': '@tui.chevron-up',
  'chevron-down': '@tui.chevron-down',
  'ellipsis-vertical': '@tui.ellipsis-vertical',
  /* Rooms menu */
  'text-rooms': '@tui.message-circle-more',
  'audio-lines': '@tui.audio-lines',
  /* Auth / forms */
  user: '@tui.user',
  lock: '@tui.lock',
  'file-user': '@tui.file-user',
  mail: '@tui.mail',
  'log-in': '@tui.log-in',
  'log-out': '@tui.log-out',
  'user-plus': '@tui.user-plus',
  key: '@tui.key',
  'key-round': '@tui.key-round',
  'shield-alert': '@tui.shield-alert',
  'shield-check': '@tui.shield-check',
  ticket: '@tui.ticket',
  clock: '@tui.clock',
  /* Voice / media */
  mic: '@tui.mic',
  'mic-off': '@tui.mic-off',
  headphones: '@tui.headphones',
  'headphone-off': '@tui.headphone-off',
  video: '@tui.video',
  'video-off': '@tui.video-off',
  'screen-share': '@tui.screen-share',
  'screen-share-off': '@tui.screen-share-off',
  'sliders-horizontal': '@tui.sliders-horizontal',
  phone: '@tui.phone',
  'phone-call': '@tui.phone-call',
  'phone-off': '@tui.phone-off',
  'message-circle': '@tui.message-circle',
  'volume-2': '@tui.volume-2',
  'monitor-pause': '@tui.monitor-pause',
  minimize: '@tui.minimize',
  maximize: '@tui.maximize',
  sparkles: '@tui.sparkles',
  square: '@tui.square',
  'badge-check': '@tui.badge-check',
  'triangle-alert': '@tui.triangle-alert',
  /* Chat / UI */
  search: '@tui.search',
  'arrow-down': '@tui.arrow-down',
  close: '@tui.x',
  paperclip: '@tui.paperclip',
  send: '@tui.send',
  reply: '@tui.reply',
  check: '@tui.check',
  'check-check': '@tui.check-check',
  'circle-x': '@tui.circle-x',
  'circle-alert': '@tui.circle-alert',
  help: '@tui.message-circle-question-mark',
  /* Actions */
  edit: '@tui.edit',
  ban: '@tui.ban',
  play: '@tui.play',
  eye: '@tui.eye',
  'eye-off': '@tui.eye-off',
  /* Avatars */
  droplet: '@tui.droplet',
  'cloud-upload': '@tui.cloud-upload',
  bookmark: '@tui.bookmark',
  users: '@tui.users',
} as const;
