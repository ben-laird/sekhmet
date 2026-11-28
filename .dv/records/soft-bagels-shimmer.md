---
type: fix
packages:
  - "@sekhmet/panic"
---

catchUnwind reads a returned thenable's then once and calls it with Reflect.apply, as await does, instead of reading it again to adopt it (#114)
