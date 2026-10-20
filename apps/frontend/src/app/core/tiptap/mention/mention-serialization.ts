import {
  formatRoleMention,
  formatUserMention,
  MENTION_EVERYONE,
  splitMentionSegments,
  TMentionSegment,
} from '@konvoez/shared';

export function buildMentionHtml(
  kind: 'user' | 'role' | 'everyone' | string,
  id: number | null,
  label: string,
): string {
  const span = document.createElement('span');
  span.setAttribute('data-type', 'mention');
  span.setAttribute('data-kind', kind);
  if (id !== null && id !== undefined) {
    span.setAttribute('data-id', String(id));
  }
  const cleanLabel = label.startsWith('@') ? label.slice(1) : label;
  span.textContent = `@${cleanLabel}`;
  return span.outerHTML;
}

export function serializeMentionNodes(html: string): string {
  if (!html) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const mentionSpans = Array.from(
    doc.body.querySelectorAll<HTMLSpanElement>('span[data-type="mention"]'),
  );

  for (const span of mentionSpans) {
    const kind = span.getAttribute('data-kind');
    const rawId = span.getAttribute('data-id');
    const id = rawId !== null && rawId !== '' ? parseInt(rawId, 10) : null;

    let tokenText: string;
    if (kind === 'everyone') {
      tokenText = MENTION_EVERYONE;
    } else if (kind === 'role' && id !== null && Number.isFinite(id)) {
      tokenText = formatRoleMention(id);
    } else if (kind === 'user' && id !== null && Number.isFinite(id)) {
      tokenText = formatUserMention(id);
    } else if (id !== null && Number.isFinite(id)) {
      tokenText = formatUserMention(id);
    } else {
      tokenText = span.textContent ?? '';
    }

    const textNode = doc.createTextNode(tokenText);
    span.replaceWith(textNode);
  }

  return doc.body.innerHTML;
}

export function deserializeMentionTokens(
  html: string,
  resolveLabel: (segment: TMentionSegment) => string,
): string {
  if (!html) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

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
        if (seg.type === 'user' || seg.type === 'role') {
          span.setAttribute('data-id', String(seg.id));
        }
        const label = resolveLabel(seg);
        const cleanLabel = label.startsWith('@') ? label.slice(1) : label;
        span.textContent = `@${cleanLabel}`;
        fragment.appendChild(span);
      }
    }

    textNode.replaceWith(fragment);
  }

  return doc.body.innerHTML;
}
