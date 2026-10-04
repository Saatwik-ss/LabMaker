# File Management Module

**Status:** Catalog stub — source files will be authored in a future pass.

Installing this module registers its placement on the application model and scaffolds a `src/modules/files/README.md` placeholder in the active workspace.

## Variants

| ID | Stack | Requires |
|----|-------|---------|
| `s3` | Express backend | `@aws-sdk/client-s3`, `multer` |
| `local` | Express backend | `multer` |
| `react-upload` | React frontend | `react` |

## LLM Install

```
install_module({ id: "files", variant_id: "local" })
```

Run `analyze_module({ id: "files" })` first to check package compatibility with the active workspace.
