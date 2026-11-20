---
kind: explanation
---

# Concepts

The model behind `@sekhmet/enum`: what an enum value is, how you narrow and
match it, how the main and mini APIs relate, and which operations mutate.

## Variants are tuples

An enum value holds exactly one **variant**: a tuple whose first element is its
**kind** (a string) and whose optional second element is its **value**.

```ts
import type { SomeVariant } from "@sekhmet/enum/core";

const loaded: SomeVariant = ["Loaded", { rows: 3 }]; // [kind, value]
const empty: SomeVariant = ["Empty"]; // [kind]
```

A union of variant tuples describes every state a type can be in. `Split` builds
that union from a record, which reads more easily:

```ts
import type { Split } from "@sekhmet/enum/core";

// Same as: ["Loading"] | ["Loaded", rows: number] | ["Failed", error: Error]
type Load = Split<{
	Loading: [];
	Loaded: [rows: number];
	Failed: [error: Error];
}>;
```

`Enum<T>` is the class that stores one such variant. `Option`, `Result`,
`Ordering`, `Latch`, `Poll` and `ControlFlow` are subclasses with their own
variants and constructors (`Some`, `Ok`, `Less`, `Active`, `Ready`, `Break` and
so on). The variant sits behind a symbol (see `Struct` in
`@sekhmet/primordials`), so you read it through the functions below rather than
through a property.

## Narrowing

Type guards check the kind and narrow the type:

- `isolate(value, kind)` is true when the value is of that kind;
  `isolateAny(value, kinds)` checks a set of kinds, and
  `isolateAnd(value, kind, predicate)` also tests the value, narrowing it when
  the predicate is itself a type guard.
- `eliminate(value, kind)` is the opposite: true when the value is **not** of
  that kind.
- `assertIsolated` and `assertEliminated` throw instead of returning `false`.
- `union(value)` reads the value of the (narrowed) variant, and
  `unionKinds(value)` its kind.

```ts
import { assertEquals } from "@std/assert";
import { isolate, union } from "@sekhmet/enum/core/mini";
import { type Option, Some } from "@sekhmet/enum/option";

function double(option: Option<number>): number {
	if (isolate(option, "Some")) {
		return union(option) * 2; // narrowed: union is a number here
	}
	return 0;
}

assertEquals(double(Some(4)), 8);
```

Each feature also has named guards: `isSome`/`isNone`, `isOk`/`isErr`,
`isActive`/`isInactive`, `isReady`/`isPending`, `isBreak`/`isContinue`, and
`isLt`/`isEq`/`isGt` and friends for `Ordering`.

The guards of `Option`, `Result`, `Latch`, `Poll` and `ControlFlow` (with their
`…And` forms, where they have them) narrow two things at once. They narrow the
**variant**, so a later `match` needs only the remaining arms. They also narrow
the **type parameters**, so the value stays an `Option` (or `Result`, …) whose
emptied slot is `never`: after `isNone`, an `Option<number>` is an
`Option<never>`, which fits any `Option<U>`.

```ts
import { assertEquals } from "@std/assert";
import { match } from "@sekhmet/enum/core/mini";
import { None, type Option } from "@sekhmet/enum/option";

const option: Option<number> = None();
if (option.isNone()) {
	assertEquals(match(option)({ None: () => "empty" }), "empty"); // no Some arm
	const other: Option<string> = option; // an Option<never> fits any Option
	assertEquals(other.isNone(), true);
}
```

`Ordering` has no type parameters, so its guards narrow only the variant and
the value stays an `Ordering`. A guard that covers two kinds narrows to both:
after `isLe`, a `match` needs only the `Less` and `Equal` arms.

```ts
import { assertEquals } from "@std/assert";
import { match } from "@sekhmet/enum/core/mini";
import { compareNumbers } from "@sekhmet/enum/ordering";

const ordering = compareNumbers(1, 2);
if (ordering.isLe()) {
	const strict = match(ordering)({ Less: () => true, Equal: () => false }); // no Greater arm
	assertEquals(strict, true);
	assertEquals(ordering.reverse().isGe(), true); // still an Ordering
}
```

## Matching

`match(value)(arms)` calls the arm for the value's kind with the variant's value
and returns what the arm returns. The arms object must name every kind, so
adding a variant to a type makes every non-exhaustive `match` a type error.

```ts
import { assertEquals } from "@std/assert";
import { Enum, type Split } from "@sekhmet/enum/core";
import { match } from "@sekhmet/enum/core/mini";

type Load = Split<{
	Loading: [];
	Loaded: [rows: number];
	Failed: [error: Error];
}>;

const render = (load: Enum<Load>): string =>
	match(load)({
		Loading: () => "loading…",
		Loaded: (rows) => `${rows} rows`,
		Failed: (error) => `error: ${error.message}`,
	});

assertEquals(render(new Enum<Load>("Loaded", 3)), "3 rows");
```

The main `Enum` class from `@sekhmet/enum/core` has `match` as a method
(`load.match({ ... })`). `Option`, `Result` and the other types extend the mini
`Enum`, not the main one, so they have no `match` method: use the `match`
function from `@sekhmet/enum/core/mini`, which accepts any enum.

## Main and mini

Each feature ships twice:

| Style | Import                         | Shape                                  |
| ----- | ------------------------------ | -------------------------------------- |
| Main  | `@sekhmet/enum/<feature>`      | a class with methods: `Some(1).map(f)` |
| Mini  | `@sekhmet/enum/<feature>/mini` | free functions: `map(Some(1), f)`      |

Mini is the source of truth. Main is generated from it: every mini function
whose first parameter is the feature's type becomes a method, with the same
behaviour. The rules that follow from that:

- **A main value is a mini value.** The main `Option` extends the mini `Option`,
  so every mini function accepts it.
- **Main methods return main values.** A method whose mini function returns the
  feature's own type returns the main class, so calls chain.
- **Conversions stay in main.** A method that returns another feature's type
  returns that feature's main class: `Some(1).okOr("e")` is a main `Result`,
  `Ok(1).ok()` a main `Option`, and `Active(1).toResult()` a main `Result`.
- **Parameters accept either.** Where a method takes another enum (such as
  `and(other)`), a mini or a main value works.
- **`fromMini` converts.** `Option.fromMini(miniOption)` gives a main view of a
  mini value. The view shares the mini value's state.

Use main for readable chains, and mini where bundle size matters: a bundler
keeps only the mini functions you import, while importing a main class pulls in
all of its methods.

## Mutation

Most operations return a new value and leave their input alone. Two groups
change the value they are given:

- `Option`: `insert`, `getOrInsert`, `getOrInsertWith`, `take`, `takeIf` and
  `replace`. `take` empties the option and returns its old contents.
- `Latch`: the `activate*` and `deactivate*` functions switch the latch between
  its two states in place. That is the reason `Latch` exists.

```ts
import { assertEquals } from "@std/assert";
import { Some } from "@sekhmet/enum/option";

const slot = Some("job");
const taken = slot.take();

assertEquals(taken.unwrap(), "job");
assertEquals(slot.isNone(), true); // the original was emptied
```

## Panics

`unwrap`, `expect` and the `assert*` guards throw an `Error` when the value is
not of the kind they require. The thrown error's `cause` is the enum value.
These calls state an invariant ("this cannot be `None` here"); a throw means the
program is wrong. For expected absence or failure, use `unwrapOr`, `mapOr`,
`match` or a guard.

```ts
import { assertThrows } from "@std/assert";
import { None } from "@sekhmet/enum/option";

assertThrows(
	() => None().expect("config must be loaded"),
	Error,
	"config must be loaded",
);
```

## The types at a glance

| Type               | Variants                   | Use it for                          |
| ------------------ | -------------------------- | ----------------------------------- |
| `Option<T>`        | `Some(T)`, `None`          | a value that may be absent          |
| `Result<T,E>`      | `Ok(T)`, `Err(E)`          | an operation that can fail          |
| `Ordering`         | `Less`, `Equal`, `Greater` | the outcome of a comparison         |
| `Latch<A,I>`       | `Active(A)`, `Inactive(I)` | a two-state value switched in place |
| `Poll<T>`          | `Ready(T)`, `Pending`      | a value that may not be ready yet   |
| `ControlFlow<B,C>` | `Continue(C)`, `Break(B)`  | going on or exiting early           |
| `Enum<T>`          | any `Split<{ ... }>`       | your own sum types                  |
