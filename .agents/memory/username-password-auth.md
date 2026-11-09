---
name: Username/password accounts
description: The chosen sign-in model for Ethio HUDHUD web and native clients.
---

Use full name, username, and password for app registration; sign-in requires username and password only. Do not reintroduce Clerk or email-based app authentication. Web sessions use an HttpOnly cookie, and native clients use opaque bearer sessions stored in secure device storage. Polar may collect billing contact details on its hosted checkout; that does not make email an app login requirement.

**Why:** The product owner explicitly asked to remove Clerk and let users sign in without Gmail or email.

**How to apply:** Keep web, native, admin, and deployment flows aligned with this identity model. Password recovery is not email-based; do not promise it unless a separate recovery method is implemented.
