import { Injector } from '@angular/core';
import { mergeAttributes } from '@tiptap/core';
import { DOMOutputSpec } from '@tiptap/pm/model';
import { NodeView as ProseMirrorNodeView } from '@tiptap/pm/view';
import { TuiMention } from '@taiga-ui/editor';
import { TuiNodeView } from '@taiga-ui/editor/extensions/tiptap-node-view';
import { MentionNodeViewComponent } from '@shared/components/mention-chip/mention-node-view.component';

export const createKonvoezMention = (injector: Injector) =>
  TuiMention.extend({
    addAttributes() {
      return {
        kind: {
          default: 'user',
          keepOnSplit: true,
          parseHTML: (element) => element.getAttribute('data-kind') ?? 'user',
          renderHTML: (attributes) => ({
            'data-kind': attributes['kind'] ?? 'user',
          }),
        },
        id: {
          default: null,
          keepOnSplit: true,
          parseHTML: (element) => {
            const raw = element.getAttribute('data-id');
            if (raw === null || raw === '') {
              return null;
            }
            const parsed = parseInt(raw, 10);
            return Number.isFinite(parsed) ? parsed : null;
          },
          renderHTML: (attributes) =>
            attributes['id'] !== null && attributes['id'] !== undefined
              ? { 'data-id': String(attributes['id']) }
              : {},
        },
        label: {
          default: '',
          keepOnSplit: true,
          parseHTML: (element) => {
            const text = element.textContent?.trim() ?? '';
            return text.startsWith('@') ? text.slice(1) : text;
          },
          renderHTML: () => ({}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'span[data-type="mention"]' }];
    },

    renderHTML({ node, HTMLAttributes }): DOMOutputSpec {
      const kind = (node.attrs['kind'] as string) ?? 'user';
      const id = node.attrs['id'] as number | null;
      const label =
        (node.attrs['label'] as string) ?? (id != null ? String(id) : '');
      const attrs: Record<string, string> = {
        'data-type': 'mention',
        'data-kind': String(kind),
      };
      if (id !== null && id !== undefined) {
        attrs['data-id'] = String(id);
      }
      return [
        'span',
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, attrs),
        `@${label}`.replaceAll(/@+/g, '@'),
      ];
    },

    addNodeView() {
      return (props) =>
        new TuiNodeView(MentionNodeViewComponent, props, {
          injector,
          ...props,
        }) as unknown as ProseMirrorNodeView;
    },
  });
