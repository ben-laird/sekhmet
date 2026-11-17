import { Ok, unwrap } from "@sekhmet/enum/result/mini";
import { getStructParams, struct } from "@sekhmet/primordials/struct";
import {
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "@std/assert";
import { assertType, type IsExact } from "@std/testing/types";
import { custom, nodeKind, nodeOf } from "./node.ts";
import { type Output, parseSync, Schema } from "./schema.ts";
import { type ViewOf, viewed } from "./view.ts";

const text = new Schema({ parse: (input: string) => Ok(input) });
const Labelled = nodeKind<{ readonly label: string }>({ name: "Labelled" });

Deno.test("viewed builds the schema init describes, with the view's own properties", () => {
	// Given: a schema's init, and a view holding its child
	const node = custom({
		kind: Labelled,
		data: { label: "a" },
		children: [text],
	});

	// When: building the viewed schema
	const labelled = viewed({
		init: { parse: getStructParams(text).parse, node },
		view: { text },
	});

	// Then: it is a Schema parsing as init says, whose view is the child itself
	assertType<IsExact<Output<typeof labelled>, string>>(true);
	assertInstanceOf(labelled, Schema);
	assertEquals(unwrap(parseSync(labelled, "x")), "x");
	assertStrictEquals(nodeOf(labelled), node);
	assertStrictEquals(labelled.text, text);
	assertEquals(Object.keys(labelled), ["text"]);
	assertType<IsExact<typeof labelled.text, typeof text>>(true);
});

Deno.test("viewed keeps a view's literal types, and ViewOf reads the view back", () => {
	// Given: a view with a literal key
	const tagged = viewed({
		init: { parse: (input: string) => Ok(input) },
		view: { key: "kind", text },
	});

	// When: reading its view's type
	type View = ViewOf<typeof tagged>;

	// Then: the literal stays, and the view is exactly what was passed
	assertEquals(tagged.key, "kind");
	assertType<
		IsExact<View, { readonly key: "kind"; readonly text: typeof text }>
	>(true);
});

Deno.test("viewed rejects reserved keys at the type level", () => {
	// Given: the parse of a schema to view
	const init = { parse: (input: string) => Ok(input) };

	// When: viewing it under each reserved key
	// Then: each is a type error
	// @ts-expect-error `schema` marks a field entry
	const asField = viewed({ init, view: { schema: text } });
	// @ts-expect-error a view can't shadow a main Schema method
	const asMethod = viewed({ init, view: { map: text } });
	// @ts-expect-error a view can't shadow the `with` getter
	const asGetter = viewed({ init, view: { with: text } });
	// @ts-expect-error a view has no symbol keys, as a schema keeps its params under one
	const asParams = viewed({ init, view: { [struct]: text } });

	assertInstanceOf(asField, Schema);
	assertInstanceOf(asMethod, Schema);
	assertInstanceOf(asGetter, Schema);
	assertInstanceOf(asParams, Schema);
});
