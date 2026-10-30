## 0.10.0 (2026-10-30)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.9.0 (2026-10-28)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.8.0 (2026-10-26)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.7.1 (2026-10-23)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.7.0 (2026-10-22)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.6.0 (2026-10-20)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.5.0 (2026-10-16)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.4.2 (2026-10-15)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.4.1 (2026-10-14)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.4.0 (2026-10-13)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.3.1 (2026-10-12)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.3.0 (2026-10-12)

### Features

- **desktop:** menu.help.appVersion ([7e3b474](https://github.com/Quenary/konvoez/commit/7e3b474))
- **client-dialogs:** add k-source-picker-dialog ([5d55c3d](https://github.com/Quenary/konvoez/commit/5d55c3d))
- **client-dialogs:** add k-settings-dialog ([57bdd6d](https://github.com/Quenary/konvoez/commit/57bdd6d))
- **client-dialogs:** add k-server-dialog ([808ee87](https://github.com/Quenary/konvoez/commit/808ee87))
- **ui-kit:** add dialog layout components ([ad83788](https://github.com/Quenary/konvoez/commit/ad83788))
- **ui-kit:** add k-tabs and source grid components ([772401d](https://github.com/Quenary/konvoez/commit/772401d))
- **ui-kit:** add k-hotkey-input ([c1dc212](https://github.com/Quenary/konvoez/commit/c1dc212))
- **ui-kit:** add k-checkbox ([f4f07a7](https://github.com/Quenary/konvoez/commit/f4f07a7))
- **ui-kit:** add k-field, k-input and k-message ([c4ca0b3](https://github.com/Quenary/konvoez/commit/c4ca0b3))
- **ui-kit:** add k-spinner and k-button ([b866050](https://github.com/Quenary/konvoez/commit/b866050))
- **ui-kit:** scaffold lit ui kit with taiga tokens ([c42874f](https://github.com/Quenary/konvoez/commit/c42874f))
- **client-shell:** add framework-free translator ([db1835b](https://github.com/Quenary/konvoez/commit/db1835b))
- **desktop:** implement share audio checkbox in display share dialog ([c8c2ab6](https://github.com/Quenary/konvoez/commit/c8c2ab6))

### Bug Fixes

- **desktop:** screen share cancel without retry picker or error toast ([e119162](https://github.com/Quenary/konvoez/commit/e119162))
- desktop screen share ([d34d836](https://github.com/Quenary/konvoez/commit/d34d836))

### Code Refactoring

- **ui-kit:** replace token generation with compiled Taiga theme ([6e417f4](https://github.com/Quenary/konvoez/commit/6e417f4))
- **desktop:** request initial dialog state once in adapters ([35e9281](https://github.com/Quenary/konvoez/commit/35e9281))
- **ui-kit:** rm unused k-field ([3122f1f](https://github.com/Quenary/konvoez/commit/3122f1f))
- **desktop:** restructure local bridge and dialog adapters for better separation of concerns ([d54e5f3](https://github.com/Quenary/konvoez/commit/d54e5f3))
- **desktop:** mount source picker dialog and drop legacy page styles ([aa64d43](https://github.com/Quenary/konvoez/commit/aa64d43))
- **desktop:** mount settings dialog from client-dialogs ([93f9ef9](https://github.com/Quenary/konvoez/commit/93f9ef9))
- **desktop:** mount server dialog from client-dialogs ([4eba803](https://github.com/Quenary/konvoez/commit/4eba803))
- **client-shell:** define local dialog adapter contracts ([72a3fef](https://github.com/Quenary/konvoez/commit/72a3fef))
- **client-shell:** move desktop settings schema ([0f18cee](https://github.com/Quenary/konvoez/commit/0f18cee))
- **client-shell:** move hotkey accelerator formatter from desktop ([657ae69](https://github.com/Quenary/konvoez/commit/657ae69))
- **client-shell:** move server url validation from desktop ([83a22ee](https://github.com/Quenary/konvoez/commit/83a22ee))
- **desktop:** enable dev tools ([6375240](https://github.com/Quenary/konvoez/commit/6375240))

### Styles

- **ui-kit:** dialog styles, improve theme token generation ([bccdd20](https://github.com/Quenary/konvoez/commit/bccdd20))

## 0.2.0 (2026-10-11)

### Features

- **desktop:** add hotkeys hint to settings page with styling ([54b6191](https://github.com/Quenary/konvoez/commit/54b6191))
- **desktop:** add localized application menu mirroring tray actions ([7faed03](https://github.com/Quenary/konvoez/commit/7faed03))

### Bug Fixes

- **desktop:** hide window menu on dialogs ([78f2aa4](https://github.com/Quenary/konvoez/commit/78f2aa4))
- **desktop:** settings layout and translations ([4f7fde8](https://github.com/Quenary/konvoez/commit/4f7fde8))
- **desktop:** localize settings save error ([301b349](https://github.com/Quenary/konvoez/commit/301b349))
- **desktop:** suspend global hotkeys while recording a new binding ([f8745a5](https://github.com/Quenary/konvoez/commit/f8745a5))
- **desktop:** bundle tray and window icons into dist ([a828da9](https://github.com/Quenary/konvoez/commit/a828da9))
- **desktop:** record hotkeys by physical key code without node globals, allow keys without modifier ([6cbf8c2](https://github.com/Quenary/konvoez/commit/6cbf8c2))

### Code Refactoring

- **desktop:** rm window-hotkeys circular import, use callback ([de572dc](https://github.com/Quenary/konvoez/commit/de572dc))
- **desktop:** rm unused settings.changeServer ([1f712ea](https://github.com/Quenary/konvoez/commit/1f712ea))
- **desktop:** settings styling, rm change server link ([e21f068](https://github.com/Quenary/konvoez/commit/e21f068))

## 0.1.1 (2026-10-10)

This was a version bump only for desktop to align it with other projects, there were no code changes.

## 0.1.0 (2026-10-10)

This was a version bump only for desktop to align it with other projects, there were no code changes.
