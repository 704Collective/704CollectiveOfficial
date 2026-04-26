import sanitizeHtml from 'sanitize-html';

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h2',
      'h3',
      'p',
      'ul',
      'ol',
      'li',
      'a',
      'strong',
      'em',
      'img',
      'br',
      'blockquote',
      'div',
      'span',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel', 'id', 'class'],
      img: ['src', 'alt', 'title', 'class', 'id'],
      div: ['class', 'id'],
      span: ['class', 'id'],
      h2: ['id', 'class'],
      h3: ['id', 'class'],
      p: ['class', 'id'],
      blockquote: ['class', 'id'],
      ul: ['class', 'id'],
      ol: ['class', 'id'],
      li: ['class', 'id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          rel: attribs.target === '_blank' ? 'noopener noreferrer' : (attribs.rel || ''),
        },
      }),
    },
  });
}
