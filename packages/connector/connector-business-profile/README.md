---
description: "Business Profile connector: provider descriptor and profile helpers."
kind: "package-reference"
---

# @openai-harness/connector-business-profile

## Summary

Implements the Business Profile connector: the constants, profile
normalisation helpers, types, and the `businessProfileConnectorProvider`
descriptor a host registers on `ctx.connectors`.

The profile itself is stored as connector metadata; the daily update workflow
reads its website URL through the connector service.

## Use this package

```ts
import { businessProfileConnectorProvider } from "@openai-harness/connector-business-profile";

ctx.connectors.registerProvider(businessProfileConnectorProvider);
```
