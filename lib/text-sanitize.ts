/*
 * Normalization for free text that is stored and later shown to someone
 * else (the admin, the customer's order page, the public catalog).
 *
 * React already escapes HTML, so this is not about XSS: it removes the
 * characters that are INVISIBLE or that change how text is displayed —
 * C0/C1 control characters, zero-width characters and Unicode bidi
 * overrides. With those, a submitted street name or product badge can be
 * made to render differently from what is stored (e.g. a right-to-left
 * override that visually reverses a house number in the admin's shipping
 * list, or zero-width characters that make two e-mails look identical).
 * Text is also NFC-normalized so visually equal strings compare equal.
 *
 * Cheap (a couple of regex passes over ≤ a few KB), safe for the 10 ms CPU
 * budget.
 */

// C0 controls except \t \n \r (handled below), DEL, C1 controls, soft
// hyphen, Arabic letter mark, zero-width/joiners, LRM/RLM, line/paragraph
// separators, bidi embeddings/overrides/isolates, word joiner &
// invisible operators, BOM.
const INVISIBLE_RANGES: [number, number][] = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff],
];
const hex = (n: number) => `\\u${n.toString(16).padStart(4, "0")}`;
const INVISIBLE = new RegExp(`[${INVISIBLE_RANGES.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join("")}]`, "g");

/** Single-line field (names, addresses, badges): every whitespace run becomes one space. */
export function cleanLine(value: string): string {
  return value.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** Multi-line field (descriptions, notes): keeps line breaks, drops the rest. */
export function cleanMultiline(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/*
 * E-mail shape accepted from the public store forms (after cleanLine +
 * lowercase). Stricter than "something@something.xx": no quotes, angle
 * brackets, commas, semicolons, backslashes or other characters that let
 * one field smuggle a second address or a display name into whatever tool
 * the team later pastes the list into; domain labels are letters/digits/
 * hyphens (Unicode letters allowed for IDN domains).
 */
const EMAIL_STRICT = /^[^\s@<>()[\]\\,;:"`]{1,64}@(?=.{4,253}$)[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)*\.\p{L}{2,24}$/u;

export function isStrictEmail(value: string): boolean {
  return value.length <= 160 && EMAIL_STRICT.test(value);
}
