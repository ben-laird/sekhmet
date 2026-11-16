/**
 * A private RFC 4122 version 4 UUID generator.
 *
 * `crypto.randomUUID()` exists only in secure contexts (HTTPS or localhost) in
 * browsers, while `crypto.getRandomValues()` exists everywhere, so IDs are
 * built from the latter. The output format is the same.
 *
 * @module
 */

/**
 * Generates a random RFC 4122 version 4 UUID, such as
 * `"3b241101-e2bb-4255-8caf-4136c566a962"`.
 *
 * @returns A lowercase, hyphenated version 4 UUID
 */
export function randomUuid(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	// Version 4 in the high nibble of byte 6; RFC 4122 variant (10xx) in byte 8.
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20),
	].join("-");
}
