# @konvoez/client-shell

Framework-free client utilities, validation, adapter contracts, and i18n core for Konvoez. This library contains logic usable across desktop and mobile shells.

## Scope & Capabilities

- Server URL validation (`isValidServerUrl`, `validateServerUrl`)
- Accelerator normalization and parsing (`formatKeyAccelerator`)
- Desktop settings schemas and types (`desktopSettingsSchema`, `TDesktopSettings`)
- Framework-free i18n translator (`createTranslator`, `resolveLanguage`)
- Dialog adapter contracts (`IServerDialogAdapter`, `ISettingsDialogAdapter`, `ISourcePickerDialogAdapter`, `IKonvoezLocalBridge`)

## Import Rules

- Never import `electron`, `node:*` modules, `@angular/*`, or `@taiga-ui/*`.
- May import `@konvoez/shared`.
