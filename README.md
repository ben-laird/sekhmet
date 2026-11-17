# Sekhmet

Sekhmet is a set of small TypeScript libraries for expressing program states and
effects in types: Rust-style enums (`Option`, `Result` and your own), an effect
system with fibers and cancellation, and the primitives they share.

The packages are ESM-only, have no runtime dependencies outside the repository,
run in any JavaScript runtime (Deno, Node.js, Bun, browsers), and are compiled
with TypeScript's strictest settings, including `isolatedDeclarations`.

## Packages

| Package                                                  | What it is                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`@sekhmet/enum`](packages/enum/README.md)               | Rust-style enums: `Enum`, `Option`, `Result`, `Ordering`, `Latch` and `Poll`                   |
| [`@sekhmet/effect`](packages/effect/README.md)           | Effects run on fibers: typed errors, schedulers, concurrency, cancellation with cleanup        |
| [`@sekhmet/vow`](packages/vow/README.md)                 | `Vow`, a promise-like value that resolves synchronously                                        |
| [`@sekhmet/matrix`](packages/matrix/README.md)           | `matrix()`, every combination of a set of values, for parameterized tests                      |
| [`@sekhmet/panic`](https://jsr.io/@sekhmet/panic)        | Rust-style panics: a reporting hook and a catchUnwind recovery boundary, with no global state  |
| [`@sekhmet/primordials`](packages/primordials/README.md) | `Struct`, `Subtle`, `block` and `define`: the building blocks of the other packages            |
| [`@sekhmet/workflow`](packages/workflow/README.md)       | `todo`, `unimplemented`, `unreachable` and `invariant`: panics that mark the state of the code |

Guides for each package are on the
[docs site](https://ben-laird.github.io/sekhmet/), and the API reference is on
[JSR](https://jsr.io/@sekhmet).

## Using Sekhmet

Every package is published on [JSR](https://jsr.io/@sekhmet). Add one with Deno:

```sh
deno add jsr:@sekhmet/enum
```

or, for Node.js and other npm-compatible tools, through JSR's npm compatibility
layer:

```sh
npx jsr add @sekhmet/enum      # npm
pnpm dlx jsr add @sekhmet/enum # pnpm
yarn dlx jsr add @sekhmet/enum # yarn
bunx jsr add @sekhmet/enum     # bun
```

Import a feature by its entrypoint. `@sekhmet/enum` and `@sekhmet/primordials`
have no root export, so name the feature:

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, type Result } from "@sekhmet/enum/result";

const half = (n: number): Result<number, string> =>
	n % 2 === 0 ? Ok(n / 2) : Err(`${n} is odd`);

assertEquals(
	half(10)
		.map((n) => n + 1)
		.unwrapOr(0),
	6,
);
assertEquals(half(3).unwrapOr(0), 0);
```

Larger features come in two styles with the same behaviour:

- **main** (`@sekhmet/enum/option`): classes with methods that chain, such as
  `Some(1).map(f).unwrapOr(0)`;
- **mini** (`@sekhmet/enum/option/mini`): free functions, such as
  `unwrapOr(map(Some(1), f), 0)`, so a bundler keeps only what you import.

A main value is also a mini value, so the two styles mix.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `deno task ci` runs every check;
`deno task docs:dev` serves the docs site locally.

## License

MIT. See [LICENSE.md](LICENSE.md).
