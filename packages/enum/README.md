# @sekhmet/enum

Rust-style enums for TypeScript: an `Enum` base class whose variants are tuples,
plus the types built on it: `Option`, `Result`, `Ordering`, `Latch` and `Poll`.

Each value is a class instance holding one variant, `[kind]` or `[kind, value]`.
You narrow it with type guards (`isolate`, `isSome`, `isOk`) or handle every
variant with `match`, which TypeScript checks for exhaustiveness.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/enum).

```sh
deno add jsr:@sekhmet/enum
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/enum      # npm
pnpm dlx jsr add @sekhmet/enum # pnpm
yarn dlx jsr add @sekhmet/enum # yarn
bunx jsr add @sekhmet/enum     # bun
```

The package has no root export: import the feature you need.

| Entrypoint               | What it holds                                |
| ------------------------ | -------------------------------------------- |
| `@sekhmet/enum/core`     | `Enum`, `Split`, `Isolate`, `Eliminate`      |
| `@sekhmet/enum/option`   | `Option`: `Some(value)` or `None()`          |
| `@sekhmet/enum/result`   | `Result`: `Ok(value)` or `Err(error)`        |
| `@sekhmet/enum/ordering` | `Ordering`: `Less()`, `Equal()`, `Greater()` |
| `@sekhmet/enum/latch`    | `Latch`: `Active(a)` or `Inactive(i)`        |
| `@sekhmet/enum/poll`     | `Poll`: `Ready(value)` or `Pending()`        |

## Main and mini

Every feature comes in two styles with the same behaviour:

- **Main** (`@sekhmet/enum/option`): classes with methods, so calls chain.
- **Mini** (`@sekhmet/enum/option/mini`): free functions that take the value
  first, so a bundler keeps only the functions you import.

```ts
import { assertEquals } from "@std/assert";
import { Some } from "@sekhmet/enum/option";
import {
	filter,
	map,
	Some as MiniSome,
	unwrapOr,
} from "@sekhmet/enum/option/mini";

// Main: methods
const main = Some(21)
	.map((n) => n * 2)
	.filter((n) => n > 40)
	.unwrapOr(0);

// Mini: functions
const mini = unwrapOr(
	filter(map(MiniSome(21), (n) => n * 2), (n) => n > 40),
	0,
);

assertEquals(main, 42);
assertEquals(mini, 42);
```

A main value is also a mini value, so mini functions accept it. A main method
that returns another feature's type returns that feature's main class:
`Some(1).okOr("missing")` is a main `Result`.

## Option

```ts
import { assertEquals } from "@std/assert";
import { None, type Option, Some } from "@sekhmet/enum/option";

function findUser(id: number): Option<{ name: string }> {
	return id === 1 ? Some({ name: "Ada" }) : None();
}

assertEquals(findUser(1).map((user) => user.name).unwrapOr("anonymous"), "Ada");
assertEquals(
	findUser(2).map((user) => user.name).unwrapOr("anonymous"),
	"anonymous",
);
```

## Result

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, type Result } from "@sekhmet/enum/result";

function parsePort(text: string): Result<number, string> {
	const port = Number(text);
	return Number.isInteger(port) && port > 0
		? Ok(port)
		: Err(`invalid port: ${text}`);
}

assertEquals(parsePort("8080").unwrapOr(80), 8080);
assertEquals(
	parsePort("http").mapErr((e) => e.toUpperCase()).unwrapErr(),
	"INVALID PORT: HTTP",
);
```

## Ordering

```ts
import { assertEquals } from "@std/assert";
import { compareNumbers, compareStrings } from "@sekhmet/enum/ordering";

const people = [
	{ name: "Bea", age: 30 },
	{ name: "Al", age: 30 },
];

people.sort((a, b) =>
	compareNumbers(a.age, b.age).andThen(compareStrings(a.name, b.name))
		.toNumber()
);

assertEquals(people.map((p) => p.name), ["Al", "Bea"]);
```

## Latch

A `Latch` is a two-state value you switch in place.

```ts
import { assertEquals } from "@std/assert";
import { Active, type Latch } from "@sekhmet/enum/latch";

const connection: Latch<string, string> = Active("socket");
connection.deactivate("closed by peer");

assertEquals(connection.isActive(), false);
```

## Poll

```ts
import { assertEquals } from "@std/assert";
import { Pending, Ready } from "@sekhmet/enum/poll";

assertEquals(Ready(1).map((n) => n + 1).isReady(), true);
assertEquals(Pending<number>().isPending(), true);
```

## Your own enums

```ts
import { assertEquals } from "@std/assert";
import { Enum, type Split } from "@sekhmet/enum/core";

type Shape = Split<{ Circle: [radius: number]; Square: [side: number] }>;

const square = new Enum<Shape>("Square", 3);
const area = square.match({
	Circle: (radius) => Math.PI * radius ** 2,
	Square: (side) => side ** 2,
});

assertEquals(area, 9);
```

## Learn more

- Guides: [getting started](docs/getting-started.md),
  [concepts](docs/concepts.md) and [recipes](docs/recipes.md), also on the
  [docs site](https://ben-laird.github.io/sekhmet/enum/).
- API reference: [jsr.io/@sekhmet/enum](https://jsr.io/@sekhmet/enum).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/enum/LICENSE.md).
