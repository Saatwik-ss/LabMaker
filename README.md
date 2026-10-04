# Codex: AI-Native Full-Stack Development Environment

> An AI-native development environment that adds options instead of removing them. Build through prompts, code, stock modules, or visual architecture graphs — all operating on the same underlying, inspectable source code.

---

## Overview

Codex provides **four synchronized interfaces** over a single structured Application Model (Intermediate Representation) and native source code:

1. **AI Chat & Agent**: Natural language prompt-driven feature generation, refactoring, and automated validation.
2. **Code Editor**: Direct file browsing and code editing with full source sovereignity.
3. **Module Marketplace**: Pre-built composable building blocks (Auth, CRUD, Search, File Storage, Notifications, Real-time).
4. **Architecture Visualizer**: Interactive graph of services, frontends, backends, databases, and relationships.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACES                       │
├──────────────┬──────────────┬──────────────┬─────────────┤
│  PROMPTS     │    CODE      │   MODULES    │    GRAPH    │
│  "Add auth"  │ File Editor  │ [Auth]       │ [Backend]   │
│              │ & Workspace  │ [CRUD]       │    |        │
│              │              │ [Search]     │  [DB]       │
└──────────────┴──────────────┴──────────────┴─────────────┘
                             ↓
                   APPLICATION MODEL (IR)
                             ↓
                   SOURCE CODE + RUNTIME
                             ↓
                   VALIDATION PIPELINE
                   (Lint, TypeCheck, Test, Build)
```

---

## Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build shared types**:
   ```bash
   npm run build:shared
   ```

3. **Run development mode (Backend + Frontend)**:
   ```bash
   npm run dev
   ```

   - **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   - **Backend API**: [http://localhost:3001](http://localhost:3001)

### Individual Services

- **Backend only**:
  ```bash
  npm run dev:backend
  ```

- **Frontend only**:
  ```bash
  npm run dev:frontend
  ```

- **Build everything**:
  ```bash
  npm run build
  ```

- **Type check all packages**:
  ```bash
  npm run type-check
  ```

---

## Monorepo Structure

```
LabMaker/
├── shared/                       # Shared type definitions (@codex/shared)
│   ├── src/
│   │   ├── types.ts              # 40+ interfaces (Model, Agent, Modules, etc.)
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── ai-harness/                   # AI subsystem & LLM tool loop (@codex/ai-harness)
│   ├── src/
│   │   ├── tools/
│   │   │   ├── AgentToolRegistry.ts   # 22 OpenAI-schema tools with executors
│   │   │   └── WorkspaceFs.ts         # Path-safe workspace filesystem
│   │   ├── capabilities/
│   │   │   ├── CursorAgentCapability.ts  # Groq/OpenAI tool loop + validate/retry
│   │   │   └── ChatAssistantCapability.ts
│   │   ├── indexing/
│   │   │   ├── ProjectIndexer.ts      # Keyword + symbol index
│   │   │   └── ModuleCatalogIndex.ts  # module-library/ catalog index
│   │   ├── mcp/
│   │   │   ├── CodexMcpServer.ts      # MCP JSON-RPC server (same registry)
│   │   │   └── stdio.ts               # stdio entry: `node dist/mcp/stdio.js`
│   │   ├── modules/
│   │   │   └── CompatibilityScanner.ts  # JWT/session/auth-route pattern scan
│   │   ├── crystal/                   # Optional Crystal HTTP/WS bridge
│   │   └── harness/
│   │       └── AIHarness.ts           # Capability & registry wiring
│   ├── mcp.example.json               # Cursor/Claude Desktop MCP config
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                      # Core Express backend engine (@codex/backend)
│   ├── src/
│   │   ├── agent/                # Agent Orchestrator & AI Planner
│   │   ├── api/                  # REST API route handlers
│   │   ├── core/
│   │   │   └── CodexRuntime.ts   # afterWorkspaceMutation four-way sync hook
│   │   ├── discovery/            # Project Discovery & AST heuristics
│   │   ├── generation/           # Code Generator templates
│   │   ├── modules/
│   │   │   ├── ModuleCatalog.ts  # On-disk catalog reader (module-library/)
│   │   │   └── ModuleManager.ts  # Installed module registry
│   │   ├── tools/                # Safe FileOperations & CommandRunner
│   │   ├── utils/                # Logger
│   │   ├── validation/           # Validator (ESLint, TSC, Jest, Build)
│   │   ├── index.ts              # Server startup
│   │   └── server.ts             # Express app configuration
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                     # React + Vite Web UI (@codex/frontend)
│   ├── src/
│   │   ├── api/                  # Typed API clients for backend
│   │   ├── components/ui/        # Reusable UI primitives (Button, Modal, Card, etc.)
│   │   ├── hooks/                # React hooks (useAgent, useModel, useEditor, etc.)
│   │   ├── pages/                # 6 core views (Dashboard, Editor, Chat, Graph, etc.)
│   │   ├── utils/
│   │   │   └── codeChangeEvents.ts   # codex-code-change event bus
│   │   ├── App.tsx               # Main application shell
│   │   ├── App.css               # Dark theme stylesheet
│   │   └── index.tsx             # DOM entrypoint
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── module-library/               # Installable module catalog
│   ├── express/health-router/    # ✅ Source-backed module
│   ├── auth/                     # 🔲 Stub (express-jwt, react-forms)
│   ├── crud/                     # 🔲 Stub (express-rest, react-ui)
│   ├── frontend-shell/           # 🔲 Stub (react-vite)
│   ├── backend-shell/            # 🔲 Stub (express-typescript)
│   ├── search/                   # 🔲 Stub (elasticsearch, sqlite-fts, react-search-ui)
│   ├── files/                    # 🔲 Stub (s3, local, react-upload)
│   ├── notifications/            # 🔲 Stub (email-smtp, email-sendgrid, in-app)
│   └── realtime/                 # 🔲 Stub (websocket, socketio, sse)
│
├── .codex/                       # Project metadata & Application Model storage
│   └── applicationModel.json
├── package.json                  # Monorepo workspace configuration
├── refined_spec.md               # Product specification
└── setup.sh                      # Shell setup script
```

---

## Agent Mode (LLM Tool Loop)

The Chat panel's **Agent** toggle activates an autonomous tool-calling loop powered by Groq or OpenAI.  Crystal is **not required**.

### Quick Start

1. Open **Settings** and enter a Groq API key (`GROQ_API_KEY`) or an OpenAI key.
2. Open **Chat**, toggle **Agent Mode** on, and type your task:
   > "Add a `/ping` health route to my Express backend"

The agent will:
- **Retrieve** related workspace files and catalog modules (`query_context`, `search_modules`)
- **Write/edit** files in the active workspace (`write_file`, `edit_file`)
- **Run validation** after writes — TypeScript typecheck, then tests (up to 3 retries)
- **Stream** `tool_call`, `diff`, and `terminal` chunks live to the Chat UI

No user-Apply step is needed in Agent Mode — writes go directly to disk and trigger the four-way sync (model → index → graph → editor).

### Available Agent Tools

| Group | Tools |
|-------|-------|
| File ops | `read_file`, `write_file`, `edit_file`, `delete_file`, `list_directory` |
| Recall / intel | `query_context`, `search_symbol`, `get_imports_exports`, `find_routes` |
| Modules | `search_modules`, `get_module`, `analyze_module`, `install_module`, `adapt_module` |
| App model | `get_application_model`, `update_architecture` |
| Execution | `run_command`, `run_typecheck`, `run_tests`, `run_linter`, `run_build` |

Inspect the full schema at `GET /api/ai/tools` (always returns `source: "harness"`).

---

## MCP Integration (Cursor / Claude Desktop)

The same 22 agent tools are exposed as an **MCP server** so Cursor, Claude Desktop, or any MCP-compatible client can make the same workspace changes.

### Setup

1. Build the harness:
   ```bash
   npm run build:harness   # or: cd ai-harness && npm run build
   ```

2. Add the MCP server to your Cursor/Claude Desktop config (copy from [`ai-harness/mcp.example.json`](ai-harness/mcp.example.json)):
   ```json
   {
     "mcpServers": {
       "codex": {
         "command": "node",
         "args": ["ai-harness/dist/mcp/stdio.js"],
         "env": {
           "CODEX_PROJECT_ROOT": "<path-to-your-workspace>",
           "CODEX_CATALOG_ROOT": "<path-to-LabMaker>/module-library"
         }
       }
     }
   }
   ```

3. In Cursor, open **Settings → MCP** and point to this config. All 22 tools appear in the tool picker.

> **Note:** The MCP server and the in-app agent use the **same** `AgentToolRegistry`. Writes from either path go through the same post-mutation hook (persist model → reindex → `refreshModelFromDiscovery`) so graph, editor, and modules stay in sync.

---

## Module Catalog

Modules live under `module-library/` and are discovered automatically from `module.json` manifests.

### Current Catalog

| Module | Category | Variants | Status |
|--------|----------|----------|--------|
| `health-router` | backend | `express` | ✅ Source-backed |
| `auth` | services | `express-jwt`, `react-forms` | 🔲 Stub |
| `crud` | api | `express-rest`, `react-ui` | 🔲 Stub |
| `frontend-shell` | frontend | `react-vite` | 🔲 Stub |
| `backend-shell` | backend | `express-typescript` | 🔲 Stub |
| `search` | api | `elasticsearch`, `sqlite-fts`, `react-search-ui` | 🔲 Stub |
| `files` | api | `s3`, `local`, `react-upload` | 🔲 Stub |
| `notifications` | services | `email-smtp`, `email-sendgrid`, `in-app` | 🔲 Stub |
| `realtime` | services | `websocket`, `socketio`, `sse` | 🔲 Stub |

**Source-backed:** source files are present and install copies them verbatim.  
**Stub:** `files[]` is empty; install registers the module on the Application Model and scaffolds a placeholder `README.md`. Source will be authored in a future pass.

### LLM Module Workflow

```
search_modules({ query: "auth" })
→ analyze_module({ id: "auth", variant_id: "express-jwt" })
→ install_module({ id: "auth", variant_id: "express-jwt", merge_choice: "merge" })
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `GET` | `/api/model` | Fetch current Application Model |
| `GET` | `/api/model/summary` | Fetch Model overview and statistics |
| `POST` | `/api/model/discover` | Run AST/heuristic project discovery |
| `POST` | `/api/agent/request` | Submit natural language request to AI Agent |
| `GET` | `/api/agent/status/:id` | Poll request execution status |
| `POST` | `/api/agent/approve/:id` | Approve and execute planned changes |
| `POST` | `/api/agent/cancel/:id` | Cancel pending agent request |
| `GET` | `/api/modules` | List all available catalog modules |
| `POST` | `/api/modules/:id/plan` | Compatibility check (non-mutating) |
| `POST` | `/api/modules/:id/install` | Install catalog module |
| `POST` | `/api/modules/:id/uninstall` | Uninstall module |
| `GET` | `/api/files/tree` | Retrieve directory tree |
| `GET` | `/api/files/read?path=...` | Read file content |
| `POST` | `/api/files/write` | Create or update file content |
| `GET` | `/api/ai/tools` | List all agent tool schemas (harness primary, Crystal extras) |
| `POST` | `/api/chat/stream` | SSE streaming chat/agent endpoint |
| `GET` | `/api/settings` | Read configured API keys and prompts |
| `PUT` | `/api/settings` | Save custom API keys and prompts |
| `POST` | `/api/validate` | Run comprehensive validation pipeline |

---

## License
MIT
