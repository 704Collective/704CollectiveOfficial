export type TocEntry = { level: 2 | 3; id: string; text: string };

function innerText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function slugifyForId(text: string, used: Map<string, number>): string {
  let base =
    text
      .toLowerCase()
      .replace(/&[a-z]+;/gi, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/**
 * Adds stable `id` attributes to h2/h3 and builds a TOC list (in document order).
 * Run on already-sanitized HTML.
 */
export function injectHeadingAnchorsAndBuildToc(html: string): { html: string; toc: TocEntry[] } {
  const used = new Map<string, number>();
  const toc: TocEntry[] = [];
  const out = html.replace(
    /<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/gi,
    (full, levelStr: string, attrs: string, inner: string) => {
      const level = Number(levelStr) as 2 | 3;
      const existingId = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
      if (existingId) {
        const id = existingId[1];
        toc.push({ level, id, text: innerText(inner) });
        return full;
      }
      const text = innerText(inner);
      const id = slugifyForId(text, used);
      toc.push({ level, id, text });
      const trimmed = (attrs ?? '').trim();
      const newAttrs = trimmed ? `${trimmed} id="${id}"` : ` id="${id}"`;
      return `<h${levelStr}${newAttrs}>${inner}</h${levelStr}>`;
    }
  );
  return { html: out, toc };
}
