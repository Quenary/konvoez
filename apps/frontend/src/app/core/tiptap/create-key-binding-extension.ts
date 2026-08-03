import { type Editor, Extension } from '@tiptap/core';

export function createKeyBindingExtension(
  key: string,
  handler: (props: { editor: Editor }) => boolean,
): Extension {
  const extensionName = `keyBinding_${key.replaceAll(/[^a-zA-Z0-9]+/g, '_')}`;

  return Extension.create({
    name: extensionName,
    addKeyboardShortcuts() {
      return {
        [key]: () => handler({ editor: this.editor }),
      };
    },
  });
}
