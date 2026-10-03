import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export function createPasteFilesExtension(
  onFiles: (files: File[]) => boolean,
): Extension {
  return Extension.create({
    name: 'pasteFiles',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handlePaste(_view, event) {
              const files = Array.from(event.clipboardData?.files ?? []);
              if (files.length === 0) {
                return false;
              }
              return onFiles(files);
            },
          },
        }),
      ];
    },
  });
}
