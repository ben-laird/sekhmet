---
kind: how-to
---

# Recipes

Short, runnable patterns. Each one uses the main API; every method has a mini
function of the same name in the feature's `/mini` entrypoint.

## Wrap a nullable value

`maybe` turns `null` and `undefined` into `None` and anything else, falsy
values included, into `Some`. Its `absent` option narrows that to just
`"undefined"` or just `"null"` when the other is a real value.

```ts
import { assertEquals } from "@std/assert";
import { maybe, None, Some } from "@sekhmet/enum/option";

const env: Record<string, string | undefined> = { PORT: "8080" };

assertEquals(maybe(env.PORT).map(Number).unwrapOr(80), 8080);
assertEquals(maybe(env.HOST).unwrapOr("localhost"), "localhost");
assertEquals(maybe(0), Some(0));

// A JSON `null` is a value; only a missing key is absent
const body: Record<string, unknown> = { note: null };
assertEquals(maybe(body.note, { absent: "undefined" }), Some(null));
assertEquals(maybe(body.title, { absent: "undefined" }), None());
```

## Wrap a function that throws

Turn a throwing call into a `Result` once, at the edge, so the rest of the code
handles failure as a value.

`fallible` wraps the function: a return becomes `Ok`, and a throw becomes `Err`
of what `parseErr` makes of it. `fallibleAsync` does the same for a function
that returns a promise.

```ts
import { assertEquals } from "@std/assert";
import { fallible } from "@sekhmet/enum/result";

const parseJson = fallible({
	fn: (text: string): unknown => JSON.parse(text),
	parseErr: ({ error }) => {
		return error instanceof Error ? error.message : String(error);
	},
});

assertEquals(parseJson('{"a":1}').isOk(), true);
assertEquals(parseJson("{").isErr(), true);
```

A throw from `parseErr` or from the optional `cleanup` is not captured: it
propagates as in a plain `try`/`catch`/`finally`, so keep both from throwing.

## Validate in steps

`andThen` runs the next step only on success, so the first failure is the
result.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, type Result } from "@sekhmet/enum/result";

type Signup = { name: string; age: number };

const requireName = (input: Signup): Result<Signup, string> =>
	input.name.trim() === "" ? Err("name is required") : Ok(input);

const requireAdult = (input: Signup): Result<Signup, string> =>
	input.age < 18 ? Err("must be 18 or older") : Ok(input);

const validate = (input: Signup): Result<Signup, string> =>
	Ok<Signup, string>(input).andThen(requireName).andThen(requireAdult);

assertEquals(validate({ name: "Ada", age: 36 }).isOk(), true);
assertEquals(validate({ name: "", age: 12 }).unwrapErr(), "name is required");
```

## Recover from an error

`orElse` tries an alternative when the result is an error; `unwrapOrElse`
computes a fallback value from the error.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, type Result } from "@sekhmet/enum/result";

const fromCache = (key: string): Result<string, string> =>
	Err(`cache miss: ${key}`);
const fromDisk = (key: string): Result<string, string> =>
	Ok(`${key} from disk`);

assertEquals(
	fromCache("a")
		.orElse(() => fromDisk("a"))
		.unwrap(),
	"a from disk",
);
assertEquals(
	fromCache("b").unwrapOrElse((error) => `default (${error})`),
	"default (cache miss: b)",
);
```

## Combine two optional values

```ts
import { assertEquals } from "@std/assert";
import { None, Some } from "@sekhmet/enum/option";

const width = Some(3);
const height = Some(4);

assertEquals(width.zipWith(height, (w, h) => w * h).unwrapOr(0), 12);
assertEquals(width.zipWith(None<number>(), (w, h) => w * h).unwrapOr(0), 0);
```

## Turn an `Option` of a `Result` inside out

`transpose` swaps the layers: `Some(Ok(x))` becomes `Ok(Some(x))`, `None`
becomes `Ok(None)`, and `Some(Err(e))` becomes `Err(e)`. Like Rust's, it is a
method only of an option of a result: its `this` parameter is
`Option<Result<T, E>>`, so calling it on any other option is a type error.
`Result`'s `transpose` turns the layers back.

```ts
import { assertEquals } from "@std/assert";
import { None, Some } from "@sekhmet/enum/option";
import { Err, Ok, type Result } from "@sekhmet/enum/result";

const parse = (text: string): Result<number, string> =>
	Number.isNaN(Number(text)) ? Err(`bad number: ${text}`) : Ok(Number(text));

// An optional field that must be valid when present
assertEquals(Some("5").map(parse).transpose().unwrap().unwrap(), 5);
assertEquals(None<string>().map(parse).transpose().unwrap().isNone(), true);
assertEquals(Some("x").map(parse).transpose().unwrapErr(), "bad number: x");

// And back again
assertEquals(Some("5").map(parse).transpose().transpose().unwrap().unwrap(), 5);
```

## Lazily fill a cache slot

The mutating `Option` operations suit a slot that is filled once.

```ts
import { assertEquals } from "@std/assert";
import { None } from "@sekhmet/enum/option";

let computed = 0;
const slot = None<number>();
const expensive = () => {
	computed++;
	return 42;
};

assertEquals(slot.getOrInsertWith(expensive), 42);
assertEquals(slot.getOrInsertWith(expensive), 42);
assertEquals(computed, 1); // the second call reused the stored value
```

## Sort by several keys

`andThen` on an `Ordering` breaks ties; `reverse` flips the direction.

```ts
import { assertEquals } from "@std/assert";
import { compareBy, compareByString } from "@sekhmet/enum/ordering";

type Task = { title: string; priority: number };

const tasks: Task[] = [
	{ title: "b", priority: 1 },
	{ title: "a", priority: 1 },
	{ title: "c", priority: 2 },
];

// Highest priority first, then by title
tasks.sort((x, y) =>
	compareBy(x, y, (t) => t.priority)
		.reverse()
		.andThen(compareByString(x, y, (t) => t.title))
		.toNumber(),
);

assertEquals(
	tasks.map((t) => t.title),
	["c", "a", "b"],
);
```

## Model a connection with a `Latch`

A `Latch` keeps two typed states and switches between them in place, which suits
a resource held inside another object.

```ts
import { assertEquals } from "@std/assert";
import { Active, type Latch } from "@sekhmet/enum/latch";

class Session {
	#state: Latch<{ token: string }, { reason: string }> = Active({
		token: "t-1",
	});

	logout(reason: string): void {
		this.#state.deactivate({ reason });
	}

	describe(): string {
		return this.#state.mapOrElse(
			({ token }) => `signed in (${token})`,
			({ reason }) => `signed out: ${reason}`,
		);
	}
}

const session = new Session();
session.logout("expired");
assertEquals(session.describe(), "signed out: expired");
```

## Define your own enum

```ts
import { assertEquals } from "@std/assert";
import { Enum, type Split } from "@sekhmet/enum/core";

type Payment = Split<{
	Card: [last4: string];
	Cash: [];
	Voucher: [code: string];
}>;

const label = (payment: Enum<Payment>): string =>
	payment.match({
		Card: (last4) => `card ending ${last4}`,
		Cash: () => "cash",
		Voucher: (code) => `voucher ${code}`,
	});

assertEquals(label(new Enum<Payment>("Card", "4242")), "card ending 4242");
assertEquals(label(new Enum<Payment>("Cash")), "cash");
```
