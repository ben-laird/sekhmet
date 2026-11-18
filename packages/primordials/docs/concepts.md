---
kind: explanation
---

# Concepts

## Why `Struct`

A `Struct<T>` stores one value of type `T` under a symbol key instead of a named
property. The data is not hidden (JavaScript has no way to do that for a
subclass-friendly field), but it stays out of autocomplete, out of the class's
public shape, and out of the way of method names. You reach it deliberately,
with `getStructParams`.

This is the base of every Sekhmet value type:

- `Enum` (from `@sekhmet/enum/core`) is a `Struct<{ variant }>`; the variant
  tuple is its data. Methods such as `Option.take` replace that variant in
  place.
- `Effect` and `Fiber` (from `@sekhmet/effect`) are `Struct`s holding their
  function and their state.

Because the data lives in one object, two class instances can share it. The
generated main classes in `@sekhmet/enum` and `@sekhmet/effect` use this: a main
view of a mini value shares its params, so a change through one is visible
through the other.

```ts
import { assertEquals } from "@std/assert";
import { getStructParams, Struct, struct } from "@sekhmet/primordials/struct";

class Box extends Struct<{ value: number }> {}

const a = new Box({ value: 1 });
const b = new Box({ value: 0 });
b[struct] = getStructParams(a); // b now shares a's params

getStructParams(a).value = 2;
assertEquals(getStructParams(b).value, 2);
```

## Why `Subtle`

`Subtle<T, U>` wraps a `create` function with parameters `U` that produces a
`T`. `useSubtle(subtle, ...params)` calls it. Like `Struct`, it keeps a
capability (a controller, an implementation hook) off the public surface of the
object that carries it, so only code that imports `useSubtle` reaches it.
`create` runs on every `useSubtle` call; nothing is cached.

## `block` and `define`

`block(fn)` calls `fn` and returns its result, so a few statements can stand
where an expression is required (a `const` initializer, an argument).
`define<T>(value)` returns `value` unchanged, checked against and typed as `T`;
it gives an inline literal an explicit type without a separate declaration.
