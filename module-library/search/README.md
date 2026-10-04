# Search Module

**Status:** Catalog stub — source files will be authored in a future pass.

Installing this module registers its placement on the application model and scaffolds a `src/modules/search/README.md` placeholder in the active workspace.

## Variants

| ID | Stack | Requires |
|----|-------|---------|
| `elasticsearch` | Express backend | `@elastic/elasticsearch` |
| `sqlite-fts` | Express backend | `better-sqlite3` |
| `react-search-ui` | React frontend | `react` |

## LLM Install

```
install_module({ id: "search", variant_id: "sqlite-fts" })
```

Run `analyze_module({ id: "search" })` first to check package compatibility with the active workspace.
