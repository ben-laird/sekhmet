import { assertEquals, assertMatch } from "@std/assert";
import { randomUuid } from "./uuid.ts";

const V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

Deno.test("randomUuid() returns an RFC 4122 version 4 UUID", () => {
	// Given/When: many generated IDs
	const ids = Array.from({ length: 1000 }, randomUuid);

	// Then: each has the v4 version nibble and the RFC 4122 variant bits
	for (const id of ids) assertMatch(id, V4);
});

Deno.test("randomUuid() returns distinct IDs", () => {
	// Given/When: many generated IDs
	const ids = Array.from({ length: 1000 }, randomUuid);

	// Then: no two are equal
	assertEquals(new Set(ids).size, ids.length);
});
