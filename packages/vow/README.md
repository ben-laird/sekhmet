# @sekhmet/vow

`Vow` is a promise-like value that resolves **synchronously**. A vow is
`Pending` until something resolves it, then `Resolved` with its value. Callbacks
attached with `map` or `zip` run inside the `resolve` call, not on a later
microtask, so a value flows through a chain of vows in one call stack. `wait`
and `fromPromise` bridge to promises.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/vow).

```sh
deno add jsr:@sekhmet/vow
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/vow      # npm
pnpm dlx jsr add @sekhmet/vow # pnpm
yarn dlx jsr add @sekhmet/vow # yarn
bunx jsr add @sekhmet/vow     # bun
```

## Example

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver, wait, zipWith } from "@sekhmet/vow";

const { vow: price, resolve: setPrice } = vowWithResolver<number>();
const { vow: quantity, resolve: setQuantity } = vowWithResolver<number>();

const seen: number[] = [];
const total = zipWith(price, quantity, (p, q) => p * q);
map(total, (value) => seen.push(value));

setPrice(5);
assertEquals(seen, []); // still waiting for the quantity

setQuantity(3);
assertEquals(seen, [15]); // ran synchronously inside setQuantity

assertEquals(await wait(total), 15);
```

## API

`@sekhmet/vow` exports free functions; `@sekhmet/vow/mini` exports the same set.

| Export                              | Does                                                           |
| ----------------------------------- | -------------------------------------------------------------- |
| `new Vow(executor)`                 | a vow the executor resolves, now or later                      |
| `vowWithResolver()`                 | a pending vow and the function that resolves it                |
| `resolved(value)`                   | a vow already resolved with `value`                            |
| `map(vow, f)`                       | a vow of `f(value)`                                            |
| `andThen(vow, f)`                   | a vow of the value of the vow `f(value)` returns               |
| `zip(a, b)`, `zipWith(a, b, f)`     | a vow of both values once both resolve                         |
| `wait(vow)`                         | a `Promise` of the value                                       |
| `value(vow)`                        | `Some(value)` once resolved, `None` while pending, read now    |
| `isResolved(vow)`, `isPending(vow)` | type guards for the vow's current state                        |
| `fromPromise(promise)`              | a vow of `Ok(value)` or `Err(reason)` once the promise settles |

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) builds an order
  total from values that arrive separately, step by step.
- **How-to guides:** [Recipes](./docs/recipes.md) for resolving a vow from a
  callback or an executor, starting a chain from a value you already have,
  combining vows, chaining a step that returns a vow, reading a resolved vow's
  value synchronously, awaiting a vow, turning a promise into a vow and handling
  its failure, and catching errors thrown by dependents.
- **Explanation:** [Concepts](./docs/concepts.md) covers when to use a vow
  rather than a promise, why resolution is synchronous, how a vow is built as an
  enum, resolve-once semantics, why a vow cannot fail, and errors in dependents.
- **Reference:** the [API reference on JSR](https://jsr.io/@sekhmet/vow/doc)
  documents every export.

The guides are also on the
[docs site](https://ben-laird.github.io/sekhmet/vow/).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/vow/LICENSE.md).
