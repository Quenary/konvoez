import {
  formatRoleMention,
  formatUserMention,
  MENTION_EVERYONE,
  splitMentionSegments,
} from '@konvoez/shared';

export function insertMentionPlaceholders(sanitizedHtml: string): string {
  if (!sanitizedHtml) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizedHtml, 'text/html');

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== doc.body) {
        const tag = parent.tagName.toLowerCase();
        if (tag === 'code' || tag === 'pre') {
          return NodeFilter.FILTER_REJECT;
        }
        if (tag === 'span' && parent.getAttribute('data-type') === 'mention') {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    if (!text) {
      continue;
    }

    const segments = splitMentionSegments(text);
    const hasMentions = segments.some((s) => s.type !== 'text');
    if (!hasMentions) {
      continue;
    }

    const fragment = doc.createDocumentFragment();
    for (const seg of segments) {
      if (seg.type === 'text') {
        fragment.appendChild(doc.createTextNode(seg.value));
      } else {
        const span = doc.createElement('span');
        span.setAttribute('data-type', 'mention');
        span.setAttribute('data-kind', seg.type);
        if (seg.type === 'user') {
          span.setAttribute('data-id', String(seg.id));
          span.textContent = formatUserMention(seg.id);
        } else if (seg.type === 'role') {
          span.setAttribute('data-id', String(seg.id));
          span.textContent = formatRoleMention(seg.id);
        } else {
          span.textContent = MENTION_EVERYONE;
        }
        fragment.appendChild(span);
      }
    }

    textNode.replaceWith(fragment);
  }

  return doc.body.innerHTML;
}
