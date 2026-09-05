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
├── backend/                      # Core Express backend engine (@codex/backend)
│   ├── src/
│   │   ├── agent/                # Agent Orchestrator & AI Planner
│   │   ├── api/                  # REST API route handlers
│   │   ├── core/                 # ApplicationModelManager
│   │   ├── discovery/            # Project Discovery & AST heuristics
│   │   ├── generation/           # Code Generator templates
│   │   ├── modules/              # Stock Module Manager
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
│   │   ├── App.tsx               # Main application shell
│   │   ├── App.css               # Dark theme stylesheet
│   │   └── index.tsx             # DOM entrypoint
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── .codex/                       # Project metadata & Application Model storage
│   └── applicationModel.json
├── package.json                  # Monorepo workspace configuration
├── refined_spec.md               # Product specification
└── setup.sh                      # Shell setup script
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
| `GET` | `/api/modules` | List all available stock modules |
| `POST` | `/api/modules/:id/install` | Install stock module with selected variant |
| `POST` | `/api/modules/:id/uninstall`| Deprecate/uninstall module |
| `GET` | `/api/files/tree` | Retrieve directory tree |
| `GET` | `/api/files/read?path=...` | Read file content |
| `POST` | `/api/files/write` | Create or update file content |
| `GET` | `/api/settings` | Read configured API keys and prompts |
| `PUT` | `/api/settings` | Save custom API keys and prompts |
| `POST` | `/api/validate` | Run comprehensive validation pipeline |

---

## License
MIT
