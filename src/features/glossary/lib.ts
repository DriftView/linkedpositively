/** Pure helpers for the glossary. */

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** "A"–"Z", or "#" for terms starting with a digit or symbol. */
export function termLetter(name: string) {
  const first = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

export function termSlug(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\+/g, "-plus")
      .replace(/=/g, "-equals-")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "term"
  );
}
