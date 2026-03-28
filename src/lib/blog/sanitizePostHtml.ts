import DOMPurify from 'isomorphic-dompurify';

export function sanitizeBlogHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
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
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
  });
}
