export function emailLocalPart(email?: string | null): string | null {
  const local = (email ?? '').split('@')[0]?.trim();
  return local || null;
}

export function nameWords(fullName?: string | null): string[] {
  return (fullName ?? '').trim().split(/\s+/).filter(Boolean);
}

export function firstName(fullName?: string | null, email?: string | null): string {
  const first = nameWords(fullName)[0];
  if (first) return first;
  return emailLocalPart(email) || 'Someone';
}

export function lastName(fullName?: string | null): string | null {
  const words = nameWords(fullName);
  return words.length > 1 ? words[words.length - 1] : null;
}

/** Chip/list label: first name, email local-part fallback. Never "Seed Seed". */
export function chipName(
  person: { full_name?: string | null; email?: string | null },
  others: { full_name?: string | null; email?: string | null }[] = []
): string {
  const first = firstName(person.full_name, person.email);
  const last = lastName(person.full_name);
  if (last && last.toLowerCase() === first.toLowerCase()) {
    return first;
  }
  const collide = others.some(
    (other) => other !== person && firstName(other.full_name, other.email) === first
  );
  if (collide) {
    if (last) return `${first} ${last}`;
    const local = emailLocalPart(person.email);
    if (local) return local;
  }
  return first;
}

/** First + last initials. Single-word names use the first two letters. */
export function personInitials(fullName?: string | null, email?: string | null): string {
  const words = nameWords(fullName);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const local = emailLocalPart(email);
  return (local?.slice(0, 2) || '?').toUpperCase();
}
