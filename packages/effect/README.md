# @sekhmet/effect

A small effect system for TypeScript. An `Effect<I, T, E>` describes a
computation that takes an input `I` and either succeeds with `T` or fails with a
typed error `E`. Nothing runs until you `fork` the effect on a `Runtime`, which
runs it on a lightweight **fiber** driven by a **scheduler** you choose. Fibers
can be joined, cancelled (running cleanup), and composed concurrently.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/effect).

```sh
deno add jsr:@sekhmet/effect
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/effect      # npm
pnpm dlx jsr add @sekhmet/effect # pnpm
yarn dlx jsr add @sekhmet/effect # yarn
bunx jsr add @sekhmet/effect     # bun
```

## Example

```ts
import { assertEquals } from "@std/assert";
import { Success } from "@sekhmet/effect/effect";
import { fork } from "@sekhmet/effect/fiber";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Ok } from "@sekhmet/enum/result/mini";

// Describe the work
const effect = Success(20)
	.map((n) => n + 1)
	.andThen((n) => Success(n * 2));

// Choose where it runs: a synchronous scheduler runs it to completion now
const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

// Run it on a fiber and read the result
const results: unknown[] = [];
fork(runtime, effect).join((result) => results.push(result));

assertEquals(results, [Ok(42)]);
```

## Main and mini

`effect` and `fiber` come in two styles with the same behaviour: main classes
with methods (`@sekhmet/effect/effect`, `@sekhmet/effect/fiber`) and
tree-shakable free functions (`@sekhmet/effect/effect/mini`,
`@sekhmet/effect/fiber/mini`).

```ts
import { assertEquals } from "@std/assert";
import { map, Success } from "@sekhmet/effect/effect/mini";
import { fork, join } from "@sekhmet/effect/fiber/mini";
import { Runtime } from "@sekhmet/effect/runtime";
import { Scheduler, sync } from "@sekhmet/effect/scheduler";
import { Ok } from "@sekhmet/enum/result/mini";

const runtime = new Runtime({
	input: undefined,
	config: { scheduler: new Scheduler({ schedule: sync() }) },
});

const results: unknown[] = [];
join(
	fork(runtime, map(Success(1), (n) => n + 1)),
	(result) => results.push(result),
);

assertEquals(results, [Ok(2)]);
```

## Entrypoints

| Entrypoint                     | What it holds                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `@sekhmet/effect`              | everything below (main style)                                                                      |
| `@sekhmet/effect/effect`       | `Effect`, `Success`, `Failure`, `EffectError`                                                      |
| `@sekhmet/effect/fiber`        | `Fiber`, `fork`, `FiberError`                                                                      |
| `@sekhmet/effect/continuation` | `Ready`, `Async`, `Deferred`: the steps an effect returns                                          |
| `@sekhmet/effect/runtime`      | `Runtime`: an effect's input and scheduler                                                         |
| `@sekhmet/effect/scheduler`    | `Scheduler` and the `sync`, `microtask`, `macrotask`, `adaptive`, `throttled`, `batched` schedules |
| `@sekhmet/effect/concurrency`  | `zip` and `joinEffect`                                                                             |

## Learn more

- Guides: [getting started](docs/getting-started.md),
  [concepts](docs/concepts.md) and [recipes](docs/recipes.md), also on the
  [docs site](https://ben-laird.github.io/sekhmet/effect/).
- API reference: [jsr.io/@sekhmet/effect](https://jsr.io/@sekhmet/effect).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/effect/LICENSE.md).
