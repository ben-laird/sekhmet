# Workflow

Helpers that mark the state of the code itself. `@sekhmet/workflow` gives you
`todo` and `unimplemented` for code that does not exist, `unreachable` for code
the types rule out, and `invariant`, `invariantEqual`, `defined` and
`satisfies` for what only a bug can break. Each one panics through
[`@sekhmet/panic`](https://jsr.io/@sekhmet/panic) with its own name, a typed
cause, and a type guard that recognizes it.

## Installation

### Deno

```bash
deno add jsr:@sekhmet/workflow
```

### Node, Bun and other npm-compatible tools

```bash
npx jsr add @sekhmet/workflow
```

## Example

```ts
import { defined, isInvariantPanic } from "@sekhmet/workflow/invariant";
import { unreachable } from "@sekhmet/workflow/unreachable";
import { assert, assertEquals, assertThrows } from "@std/assert";

type Zone = "local" | "national";
const rates = new Map<string, number>([["local", 0]]);

function rate(zone: Zone): number {
	switch (zone) {
		case "local":
		case "national":
			return defined(rates.get(zone), {
				expectedBehavior: "every zone should have a rate",
			});
		default:
			// Adding a Zone without a case makes this line a compile error
			return unreachable({ value: zone });
	}
}

assertEquals(rate("local"), 0);

const thrown = assertThrows(() => rate("national"));
assert(isInvariantPanic(thrown));
assertEquals(thrown.cause.expectedBehavior, "every zone should have a rate");
```

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) builds a small
  shipping calculator, from a `todo` placeholder to panics caught in a
  runtime.
- **How-to guides:** [Recipes](./docs/recipes.md) for choosing a helper,
  marking unfinished work, exhaustive `switch`es, assertions, equality checks,
  narrowing with `defined` and `satisfies`, tracking and issue URLs,
  recognizing the panics, and keeping `todo` out of releases.
- **Explanation:** [Concepts](./docs/concepts.md) covers why the helpers
  panic, how they build on `@sekhmet/panic`, how the guards recognize a panic,
  equality in `invariantEqual`, how values are rendered, and why a helper
  never throws anything but its own panic.
- **Reference:** the
  [API reference on JSR](https://jsr.io/@sekhmet/workflow/doc) documents every
  helper, its options, its cause and the message it panics with.

The guides are also on the
[docs site](https://ben-laird.github.io/sekhmet/workflow/).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/workflow/LICENSE.md).
