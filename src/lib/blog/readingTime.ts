/** Word count from HTML or plain text (strips tags). */
export function countWordsFromContent(s: string): number {
  const text = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Reading time in minutes per spec: ceil(words / 200). */
export function readingTimeMinutesFromContent(content: string): number {
  const n = countWordsFromContent(content);
  return Math.ceil(n / 200);
}
