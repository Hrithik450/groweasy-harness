---
description: "Google Native OAuth authentication and multi-tenant UUIDv7 workspace provisioning."
kind: "package-reference"
---

# @deepseek-ai/dsh-google-account

## Summary

Google Native OAuth authentication and multi-tenant UUIDv7 workspace provisioning. Replaces vendor-locked accounts with Google OpenID Connect and establishes isolated on-disk user directories.

## Use this package

Compose this package in `cordis.yml` to enable Google OAuth authentication:

```yaml
- id: google-account
  name: '@deepseek-ai/dsh-google-account'
  config:
    callbackUrl: http://localhost:3000/auth/google/callback
```
