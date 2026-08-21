const TR_CHAR_MAP: Record<string, string> = {
  ğ: 'g',
  ü: 'u',
  ş: 's',
  ı: 'i',
  ö: 'o',
  ç: 'c',
};

// Unicode combining diacritical marks block (U+0300-U+036F), left over after NFD normalization.
const COMBINING_MARKS_REGEX = /[̀-ͯ]/g;

export function slugify(input: string): string {
  const lowered = input
    .toLowerCase()
    .split('')
    .map((char) => TR_CHAR_MAP[char] ?? char)
    .join('');

  return lowered
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
