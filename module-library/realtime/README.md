# Real-Time Module

**Status:** Catalog stub — source files will be authored in a future pass.

Installing this module registers its placement on the application model and scaffolds a `src/modules/realtime/README.md` placeholder in the active workspace.

## Variants

| ID | Stack | Requires |
|----|-------|---------|
| `websocket` | Express + React | `ws` |
| `socketio` | Express + React | `socket.io`, `socket.io-client` |
| `sse` | Express + React | — |

## LLM Install

```
install_module({ id: "realtime", variant_id: "sse" })
```

Run `analyze_module({ id: "realtime" })` first to check package compatibility with the active workspace.
