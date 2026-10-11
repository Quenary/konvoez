/**
 * Taiga UI's TuiLink ships with empty paste rules (TipTap Link markPasteRule disabled),
 * so pasted URLs stay plain text. That workaround avoids linkify cost on large pastes:
 * https://github.com/ueberdosis/tiptap/issues/5957
 *
 * Chat only needs single-URL paste → narrow handlePaste instead of full paste rules.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { find } from 'linkifyjs';

const MAX_PASTE_LINK_TEXT_LENGTH = 2048;

export function getPastedUrlHref(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_PASTE_LINK_TEXT_LENGTH) {
    return null;
  }

  const link = find(trimmed, { defaultProtocol: 'https' }).find(
    (item) => item.isLink && item.value === trimmed,
  );

  return link?.href ?? null;
}

export function createPasteLinkExtension(): Extension {
  return Extension.create({
    name: 'pasteLink',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('pasteLink'),
          props: {
            handlePaste(view, event, slice) {
              const files = event.clipboardData?.files;
              if (files && files.length > 0) {
                return false;
              }

              let hasLinkMark = false;
              slice.content.descendants((node) => {
                if (node.marks.some((mark) => mark.type.name === 'link')) {
                  hasLinkMark = true;
                }
              });
              if (hasLinkMark) {
                return false;
              }

              const plain =
                event.clipboardData?.getData('text/plain') ??
                slice.content.textBetween(0, slice.content.size, '\n');
              const href = getPastedUrlHref(plain);
              if (!href) {
                return false;
              }

              const linkType = view.state.schema.marks.link;
              if (!linkType) {
                return false;
              }

              const text = plain.trim();
              const node = view.state.schema.text(text, [
                linkType.create({ href }),
              ]);
              const tr = view.state.tr.replaceSelectionWith(node, false);
              view.dispatch(tr.scrollIntoView());
              return true;
            },
          },
        }),
      ];
    },
  });
}
