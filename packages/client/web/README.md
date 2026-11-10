---
description: "Web boot kernel: root Cordis Context, UI-renderer activation, and the application mount handoff."
kind: "package-reference"
---

# @openai-harness/client-web

## Summary

The thin browser boot kernel used by `apps/web`. `AppWebEntry` creates the
root Cordis `Context`, activates `@openai-harness/client-ui-renderer/client`
(which installs `ctx.slots` and provides `ctx.uiRenderer`), then mounts the
application through a dependency fiber on `uiRenderer`.

This is deliberately smaller than the reference kernel: that one also owns a
client module loader, a boot manifest, bundle prefetching, and a
framework-free boot page. The Vite shell statically imports its client
packages, so none of those layers exist here yet.

## Use

```ts
import { AppWebEntry } from "@openai-harness/client-web";

const root = document.getElementById("root");
if (root === null) throw new Error("web app: missing #root");
void new AppWebEntry(root).run();
```

The root slot is empty until a product layout entry registers into it; the
renderer draws the `[data-slot="root"]` anchor with `display:contents`.
