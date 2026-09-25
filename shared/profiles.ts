export const AVATARS = [
  { id: 'cosmic', emoji: '🪐', label: 'Cosmic trouble', color: '#593780' },
  { id: 'alien', emoji: '👽', label: 'The regular', color: '#175e56' },
  { id: 'robot', emoji: '🤖', label: 'Totally human', color: '#35557b' },
  { id: 'ghost', emoji: '👻', label: 'Ghost at the table', color: '#555078' },
  { id: 'disco', emoji: '🪩', label: 'Disco disaster', color: '#773458' },
  { id: 'octopus', emoji: '🐙', label: 'Eight lucky hands', color: '#6f4178' },
  { id: 'raccoon', emoji: '🦝', label: 'Trash royalty', color: '#525843' },
  { id: 'volcano', emoji: '🌋', label: 'Hot streak', color: '#85402e' },
] as const;
export type PublicProfile = { id: string; name: string; avatar: string; avatarId: string | null; nameChanged: boolean };
export function normalizeName(value: string) { return value.normalize('NFKC').trim().replace(/\s+/g, ' '); }
export function nameKey(value: string) { return normalizeName(value).toLowerCase(); }
export function nameError(value: string): string | null {
  const name = normalizeName(value);
  return /^[\p{L}\p{N}][\p{L}\p{N} _-]{2,23}$/u.test(name)
    ? null : 'Use 3–24 letters, numbers, spaces, underscores or hyphens. Start with a letter or number.';
}
