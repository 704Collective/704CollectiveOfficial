type OembedJson = { html?: string };

export async function fetchInstagramOembedHtml(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const endpoint = `https://api.instagram.com/oembed/?url=${encodeURIComponent(trimmed)}`;
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as OembedJson;
    return typeof data.html === 'string' ? data.html : null;
  } catch {
    return null;
  }
}

export async function fetchTikTokOembedHtml(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(trimmed)}`;
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as OembedJson;
    return typeof data.html === 'string' ? data.html : null;
  } catch {
    return null;
  }
}
