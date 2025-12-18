import { add } from "@sekhmet/new-lib";
import { assertEquals } from "@std/assert";

Deno.test("add() adds two numbers", () => {
	assertEquals(add(1, 1), 2);
});
