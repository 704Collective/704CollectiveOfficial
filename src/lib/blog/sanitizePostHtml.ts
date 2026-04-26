let _purify: typeof import('isomorphic-dompurify').default | null = null;

async function getPurify() {
  if (!_purify) {
    const mod = await import('isomorphic-dompurify');
    _purify = mod.default;
  }
  return _purify;
}

export async function sanitizeBlogHtml(html: string): Promise<string> {
  const purify = await getPurify();
  return purify.sanitize(html, {
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
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'id'],
  });
}
