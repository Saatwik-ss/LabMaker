# Notifications Module

**Status:** Catalog stub — source files will be authored in a future pass.

Installing this module registers its placement on the application model and scaffolds a `src/modules/notifications/README.md` placeholder in the active workspace.

## Variants

| ID | Stack | Requires |
|----|-------|---------|
| `email-smtp` | Express backend | `nodemailer` |
| `email-sendgrid` | Express backend | `@sendgrid/mail` |
| `in-app` | Express + React | — |

## LLM Install

```
install_module({ id: "notifications", variant_id: "in-app" })
```

Run `analyze_module({ id: "notifications" })` first to check package compatibility with the active workspace.
