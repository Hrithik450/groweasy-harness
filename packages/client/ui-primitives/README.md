---
description: "Pure React atoms for the browser UI: Button, Avatar, Modal, Toast."
kind: "package-library"
---

# @openai-harness/client-ui-primitives

## Summary

Cordis-free React atoms styled with this repository's Tailwind token
utilities. Four components ship in the foundation:

- `Button` — `primary` / `ghost` / `outline`, `md` / `sm`, optional leading
  icon, `forwardRef`.
- `Avatar` — image or initials, `sm` / `md` / `lg`. The reference primitives
  package has no standalone Avatar, so this one is authored against our
  tokens rather than ported.
- `Modal` — body portal, mask/Escape close, initial focus via
  `data-modal-autofocus`, return-focus restore, optional headless mode. The
  reference's shortcut-layer and nested-modal bookkeeping are omitted because
  this shell has no shortcut registry yet.
- `Toast` — hold/fade lifecycle, body portal, anchor-centered placement,
  success glyph, inline actions (`holdMs` semantics match the reference).

All styling reads the generated semantic tokens (`bg-card`, `border-border`,
`text-muted-foreground`, `text-accent`, …); no reference-harness class names
or palette values are used.
