export const INDEX_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

// The index letter a name files under: its first letter with accents dropped
// ("Éclair" → E), or # for anything that doesn't start with one.
export function indexLetter(name: string): string {
  const first = name.trim().charAt(0).normalize('NFD').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}
