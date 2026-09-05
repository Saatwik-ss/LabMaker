# AI-Native Full-Stack Development Environment
## Refined Specification & Comparative Analysis

---

## EXECUTIVE SUMMARY

**Product Name (Working):** `Codex` (or `DevCanvas`, `ArchFlow`)

**Core Thesis:**
An AI-native development environment that adds options instead of removing them. Developers can build through prompts, code, stock modules, or visual graphs—all operating on the same underlying, inspectable source code.

**Differs From:**
- **Claude Code** — focused on isolated tasks, not continuous project development
- **Cursor** — AI-enhanced editor, but no structured application model or module system
- **Vercel v0** — visual UI generation, not full-stack; doesn't preserve code ownership
- **Replit** — cloud-first IDE, not AI-native architecture
- **n8n** — visual workflow, different use case
- **Expo/React Native** — framework-specific, not general-purpose

**Positioning:** "IDE + AI Agent + Module Library + Optional Visualization"

---

## SECTION 1: REFINED CORE CONCEPT

### 1.1 Four Interfaces, One Underlying System

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACES                       │
├──────────────┬──────────────┬──────────────┬─────────────┤
│              │              │              │             │
│  PROMPTS     │    CODE      │   MODULES    │    GRAPH    │
│              │              │              │             │
│ "Add auth"   │ Editor +     │ [Auth]       │ [Auth API] -│
│              │ Terminal     │ [CRUD]       │   |         │
│              │ File browser │ [Search]     │  [DB]       │
│              │              │              │             │
└──────────────┴──────────────┴──────────────┴─────────────┘
                             ↓
                   APPLICATION MODEL
                   (Structured IR)
                             ↓
                   SOURCE CODE + RUNTIME
                             ↓
                        VALIDATION
                             ↓
                       DEVELOPER
```

### 1.2 Immutable Principle

**The Source Code Is Always Sovereign**

- Developer can always inspect it
- Developer can always modify it
- Developer can always delete anything
- Developer can always replace modules
- Developer can always move to different tools
- No vendor lock-in through hidden runtime

This is not negotiable.

---

## SECTION 2: APPLICATION MODEL (Core Innovation)

The Application Model is the structural representation that allows all four interfaces to operate coherently.

### 2.1 What It Contains

```typescript
interface ApplicationModel {
  metadata: {
    name: string;
    description: string;
    createdAt: string;
  };
  
  stack: {
    frontend: {
      framework: "react" | "next.js" | "vue" | null;
      versionManager: "vite" | "webpack" | "next" | null;
      language: "javascript" | "typescript";
      components: Component[];
    };
    
    backends: Backend[]; // Support multiple
    
    databases: Database[];
    
    ai: AIService[];
  };
  
  modules: InstalledModule[];
  
  architecture: {
    services: ServiceNode[];
    relationships: Relationship[];
    dataFlow: DataFlowEdge[];
  };
  
  files: {
    projectRoot: string;
    importantPaths: string[];
    moduleRoots: string[];
  };
  
  lastUpdated: string;
  discoveredAt: string; // Last automated discovery
}

interface Backend {
  id: string;
  name: string;
  framework: "express" | "fastapi" | "flask" | null;
  language: "javascript" | "python";
  port: number;
  routes: APIRoute[];
  middleware: Middleware[];
  services: Service[];
}

interface Database {
  id: string;
  type: "postgresql" | "mysql" | "sqlite" | "mongodb";
  name: string;
  host: string;
  schema?: Schema; // Inferred from queries or metadata
  migrationTools: "alembic" | "knex" | "raw" | null;
}

interface InstalledModule {
  id: string;
  name: string; // "auth", "crud", "search"
  version: string;
  baseDir: string;
  status: "active" | "deprecated" | "replaced";
  provides: ModuleInterface[];
  dependencies: string[];
  lastModified: string;
}

interface ModuleInterface {
  name: string;
  exports: string[]; // ["login", "logout", "getCurrentUser"]
  location: string; // file path
}
```

### 2.2 Automatic Discovery

**Ingestion Pipeline:**

```
1. SCAN FILESYSTEM
   ├── package.json / pyproject.toml / go.mod
   ├── Import statements (AST)
   ├── HTTP routes (Express, FastAPI patterns)
   └── Database files (migrations, schemas)

2. PARSE CODE
   ├── AST analysis (imports/exports)
   ├── Type definitions (TypeScript, Python type hints)
   ├── Route decorators (@app.route, @router.post)
   └── Database models (SQLAlchemy, Prisma, etc.)

3. INFER RELATIONSHIPS
   ├── Frontend calls Backend? (fetch, axios patterns)
   ├── Backend calls Database? (SQL, ORM patterns)
   ├── Services communicate? (REST, message queues)
   └── AI integration? (LLM API calls)

4. BUILD MODEL
   ├── Identify frameworks from package.json + actual usage
   ├── Map routes to handlers
   ├── Infer database schema from migrations/models
   ├── Extract module boundaries (by directory, namespace)
   └── Create service graph

5. VALIDATE
   ├── Verify relationships are real
   ├── Check for missing pieces (orphaned files)
   └── Resolve ambiguities (ask user if needed)

RESULT: Application Model
```

**Heuristics (learnable, improvable):**

```javascript
// Detect React + Vite
if (package.json.devDependencies["vite"] && 
    package.json.dependencies["react"]) {
  stack.frontend = "react" + "vite"
}

// Detect Express + Node
if (package.json.dependencies["express"] &&
    typeof rootFile === "node") {
  backends.push("express")
}

// Detect PostgreSQL usage
if (migrationFile.includes("CREATE TABLE") ||
    connectionString.includes("postgres")) {
  databases.push("postgresql")
}

// Detect authentication module
if (fileExists("auth.ts") || fileExists("authService.ts") ||
    routes.some(r => r.path.includes("/login"))) {
  modules.push({ name: "auth", status: "active" })
}
```

---

## SECTION 3: THE AI AGENT ARCHITECTURE

### 3.1 Agent Loop (Revised)

```
REQUEST
  │
  ▼
CLASSIFY INTENT
  ├─ Feature addition?
  ├─ Bug fix?
  ├─ Refactor?
  ├─ Module integration?
  └─ Architecture change?
  │
  ▼
CONTEXT RETRIEVAL
  │
  ├─ Load Application Model
  ├─ For "add comments to posts":
  │  ├─ Load Posts module
  │  ├─ Load Post frontend components
  │  ├─ Load Post API routes
  │  ├─ Load Post database schema
  │  └─ Load Comment model (if exists)
  │
  └─ NOT the entire repository
  │
  ▼
CREATE PLAN
  │
  ├─ Identify affected modules
  ├─ Identify new files needed
  ├─ Identify existing files to modify
  ├─ Identify database changes
  ├─ Identify tests needed
  └─ Present to user? (for large changes)
  │
  ▼
IMPLEMENT
  │
  ├─ Modify existing files
  ├─ Create new files
  ├─ Update database migrations
  └─ Create/update tests
  │
  ▼
VALIDATE
  │
  ├─ Lint (ESLint, Ruff)
  ├─ Type check (tsc, mypy)
  ├─ Test (jest, pytest)
  ├─ Build (vite, tsc)
  └─ Schema validation
  │
  ├─── FAIL?
  │     │
  │     ├─ Read error message
  │     ├─ Identify root cause
  │     ├─ Modify code
  │     └─ Re-validate (max 3 loops)
  │
  └─── PASS?
        │
        ▼
      UPDATE MODEL
        │
        ▼
    SHOW CHANGES
        │
        ├─ Files added
        ├─ Files modified
        ├─ Diff view
        └─ Summary
        │
        ▼
      DONE
```

### 3.2 Tool Acces

The AI has these tools:

**File Operations**
```typescript
// These are the ONLY filesystem operations
readFile(path: string): string
writeFile(path: string, content: string): void
editFile(path: string, edits: Edit[]): void
deleteFile(path: string): void
listDirectory(path: string): Entry[]
```

**Code Intelligence**
```typescript
// Semantic understanding, not regex
searchSymbol(name: string): Location[]
findReferences(symbol: string): Location[]
getFileAST(path: string): AST
getImportsExports(path: string): { imports, exports }
findRoutesInFile(path: string): Route[]
```

**Application Context**
```typescript
// Direct access to the model
getApplicationModel(): ApplicationModel
updateApplicationModel(changes: ModelUpdate): void
```

**Execution**
```typescript
// Actually run things
runCommand(cmd: string, cwd: string): { stdout, stderr, exitCode }
runNpmScript(script: string): { stdout, stderr, exitCode }
runPytest(path?: string): TestResult
runTypeCheck(): TypeCheckResult
runLinter(): LintResult
runBuild(): BuildResult
```

**Structured Context**
```typescript
// High-level queries to avoid massive prompts
getModule(name: string): ModuleInfo
getDatabase(name: string): DatabaseInfo
getServiceByName(name: string): ServiceInfo
getRecentChanges(): Change[]
```

---

## SECTION 4: THREE PRIMARY DEVELOPMENT MODES

### 4.1 Prompt-Driven (Natural Language)

**Examples that should work:**

```
"Add authentication using Google OAuth and MongoDB."
→ AI inspects stack, adapts stock auth module, modifies DB, creates routes

"Add real-time notifications with WebSockets."
→ AI adds Socket.io, modifies backend, updates frontend, validates

"Refactor the search module to use Elasticsearch."
→ AI keeps existing search API, swaps backend implementation

"Move image processing to a separate Python service."
→ AI creates FastAPI service, modifies Node to call it, adds tests

"Fix the TypeScript errors."
→ AI reads errors, modifies types, re-validates

"Optimize the database query for users/posts."
→ AI inspects schema, analyzes query, adds indexes, tests performance
```

**NOT expected to work (out of scope for MVP):**

```
"Deploy this to AWS Lambda"        → Deployment
"Add Docker and Kubernetes config"  → Infrastructure
"Generate 10,000 test cases"        → Massive generation
"Rewrite the entire app in Rust"    → Language migration
```

### 4.2 Direct Code (Traditional Developer Workflow)

The platform is a **real IDE**. Users can:

- Open files and edit freely
- Create/delete/move files
- Use terminal
- Run any npm/python command
- Use Git normally
- Read/modify any generated code
- Replace stock modules with custom implementations
- Write their own code alongside AI-generated code
- Completely ignore the graph and modules

**This must feel native, not clunky.**

### 4.3 Module-Driven (Composable Building Blocks)

**Stock modules provide:**
- Complete, tested implementations
- Real source code (not black boxes)
- Framework-aware variants
- Mergeable integration
- Documentation

**Available for MVP:**
```
Authentication (JWT, OAuth, sessions)
CRUD (generic create/read/update/delete)
Search (full-text, filters, pagination)
Notifications (in-app, email, WebSocket)
File Upload (cloud storage abstraction)
Dashboard (layout + components + state management)
```

---

## SECTION 5: COMPARATIVE ANALYSIS

### How This Differs From Existing Tools

| Tool | Approach | Limitation | Our Approach |
|------|----------|-----------|--------------|
| **Claude Code** | Task-focused AI | Single-file generation, not project-aware | Continuous project model, sees entire architecture |
| **Cursor** | AI-enhanced editor | AI is autocomplete-like, not agent-like | Full agent loop with validation and iteration, agentic ai is also a component |
| **v0.dev** | Visual UI generation | Generates UI only, not full-stack; vendor lock-in via React component library | Full-stack, complete source code, no lock-in |
| **Replit** | Cloud IDE + AI | Cloud-first (latency), limited offline | Local-first, better for complex projects |
| **GitHub Copilot** | Autocomplete | Autocomplete only, no project understanding | Structured project model, intentional changes |
| **n8n** | Visual workflow | Workflow automation, not app development | General-purpose application development, with n8n level visualization added |
| **Stack Blitz** | Browser IDE | Browser-based limitations, cloud-dependent | Browser first, users can download code repo and system design graph |

### Why This Matters

**Problem we solve:**
> Today's AI coding tools are great at generating isolated code, but terrible at understanding and maintaining multi-file, multi-layer applications over time.

**Our solution:**
> Maintain a structured model of the application. Use that model to:
> - Avoid massive prompts
> - Make intentional, coherent changes
> - Validate against real runtime
> - Iterate intelligently
> - Support multiple interfaces without conflicts

---

## SECTION 6: ARCHITECTURAL DECISIONS

### 6.1 Why Application Model is Central

**Without a model:**
- AI sees everything as strings
- Each request dumps entire repo into context
- Cost scales with repository size
- Quality decreases with complexity
- No way to ensure coherent changes
- Graph and code go out of sync

**With a model:**
- AI understands structure
- Minimal, relevant context retrieved
- Changes are intentional and validatable
- Multiple interfaces stay synchronized
- Cost and latency predictable
- Supports iterative refinement

### 6.2 Why Validation is Mandatory

**If we skip validation:**
- "It looks right" ≠ "It works"
- TypeScript errors go unnoticed
- Tests fail silently
- Database migrations break production
- Type safety is an illusion

**With real validation:**
- Actually run TypeScript compiler
- Actually run test suite
- Actually check database schema
- Catch 70% of issues before user sees them
- AI learns from real errors

### 6.3 Why No Vendor Lock-In

**If code is hidden:**
- User is trapped
- User can't migrate away
- User can't use their own tools
- User can't modify for their needs

**If code is visible:**
- User can migrate anytime
- User can use Cursor/VS Code/whatever
- User can customize everything
- User can extract modules to other projects

---

## SECTION 7: IMPLEMENTATION ROADMAP


**Goals:**
- Basic project creation and import
- File editor with syntax highlighting
- Terminal integration
- AI agent with file read/write tools
- Basic TypeScript/JavaScript support
- React + Vite support
- Application Model discovery (framework detection)
- Better context retrieval
- Full validation loop (tsc, ESLint, tests)
- Python support
- PostgreSQL/SQLite support
- Route detection
- Stock module library with tried and tested code blocks
- Non-destructive module integration
- Compatibility detection
- Module adaptation
- Architecture graph visualization
- Interactive inspection
- Visual module composition
- Performance optimization
- Large project support
- Advanced module versioning
- Deployment helpers (optional)

**Deliverables:**
```
✓ Web-based IDE (or Electron app)
✓ File system browser
✓ Agentic AI assistantlike cursor
✓ Code editor
✓ Terminal
✓ Node.js execution
✓ npm support
✓ AI agent loop (basic)
✓ Graph/ visual based module assignment and atttachement
✓ Model discovery (basic)
✓ Application Model (typed, persistent)
✓ Code intelligence (AST, imports/exports)
✓ Validation pipeline
✓ Database schema inspection
✓ Error-feedback loop
✓ Multi-backend support (Express + FastAPI)
✓ 5-10 stock modules (auth, CRUD, search, etc.)
✓ Module installer with conflict detection
✓ Module adaptation logic
✓ Complete integration tests
✓ Documentation
✓ Architecture graph rendering
✓ Service/module inspection UI
✓ Relationship visualization
✓ Interactive component drill-down
```


## SECTION 8: CRITICAL DESIGN DECISIONS

### 8.1 Module Merge Strategy

**Problem:** Installing auth module into project that already has auth.

**Solution:**

```
DETECTION PHASE:
  ├─ Scan codebase for auth patterns
  ├─ Find existing login routes
  ├─ Find existing user schema
  └─ Determine existing auth approach

COMPATIBILITY CHECK:
  ├─ Current: JWT tokens
  ├─ Module: JWT tokens
  ├─ Result: COMPATIBLE
  
  ├─ Current: Sessions
  ├─ Module: OAuth + JWT
  ├─ Result: INCOMPATIBLE
  
  └─ Options presented to user:
     ├─ "Use existing authentication" (keep current)
     ├─ "Merge strategies" (combine both)
     ├─ "Replace existing" (use stock module)
     └─ "Cancel"

IF USER CHOOSES MERGE:
  ├─ AI identifies points of integration
  ├─ Creates diff showing changes
  ├─ User reviews before applying
  ├─ Changes are incremental (not destructive)
  └─ All original code preserved where possible
```

### 8.2 Context Window Management

**For "Add comments to posts" in a large project:**

```
NAIVE APPROACH:
  └─ Send entire repository
     └─ 10,000+ lines of code
     └─ Wastes tokens
     └─ Reduces reasoning quality

SMART APPROACH:
  1. Application Model says: "Posts module exists"
  2. Load Posts module files (~500 lines):
     ├─ PostModel.ts
     ├─ postsAPI.ts
     ├─ PostList.tsx
     └─ PostDetail.tsx
  
  3. Load relevant schema (~50 lines):
     └─ posts table definition
  
  4. Load existing tests (~100 lines):
     └─ post.test.ts
  
  5. Send to LLM (~700 lines total)
  
  6. LLM generates Comments feature

RESULT: 15% of context, better quality
```

### 8.3 Validation Retry Logic

```
AI IMPLEMENTATION
  ▼
VALIDATION
  ├─ PASS → Return to user
  │
  └─ FAIL
      ▼
    READ ERROR
      ▼
    RETRY COUNT?
      ├─ 0 retries: Ask user
      ├─ 1 retry: Try obvious fix
      ├─ 2 retries: Try alternative approach
      └─ 3+ retries: Give up, show error to user
```

---

## SECTION 9: SUCCESS METRICS (MVP)

### Technical

- [x] Application Model accuracy > 85% (detects actual stack)
- [x] Validation catches 70%+ of issues before user sees them
- [x] AI iteration loop succeeds without manual intervention 60% of time
- [x] Context window stays < 50% of token budget
- [x] Latency < 30 seconds for typical requests

### User Experience

- [x] Users can write features via prompt
- [x] Users can write features via code
- [x] Users can integrate stock modules
- [x] Users understand what AI changed (clear diffs)
- [x] Users can modify AI-generated code easily
- [x] Net promoter score > 7/10 (early users)

### Product

- [x] Works for React + Node + PostgreSQL (primary stack)
- [x] Works for Next.js + PostgreSQL
- [x] Works for React + Python + PostgreSQL
- [x] Supports 5+ stock modules
- [x] No vendor lock-in (code is inspectable, portable)

---

## SECTION 10: RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Model discovery inaccurate | AI makes wrong assumptions | Extensive testing, user review, gradual learning |
| LLM hallucination | Generates broken code | Mandatory validation, error feedback loops, max retry limits |
| Module conflicts | Non-destructive merge fails | Diff preview before applying, version control, rollback option |
| Performance at scale | Slow for large projects | Incremental model discovery, smart caching, language servers |
| Complexity explosion | Too many options paralyzes user | Good defaults, clear documentation, example flows |
| Token cost | LLM API costs are prohibitive | Smart context retrieval, caching, support for multiple model sizes |

---

## SECTION 11: PRODUCT STATEMENT (Refined)

> **Codex is an AI-native full-stack development environment where developers build applications through natural language prompts, direct code editing, reusable complete modules, or an optional visual architecture graph. All interfaces operate on the same structured Application Model, giving AI the context it needs to make coherent, iterative changes while developers retain complete control over the underlying source code.**

**Key positioning:**
- "IDE that understands your architecture"
- "Build faster with AI, without losing control"
- "Modules as starting points, not prisons"

---

## APPENDIX A: Example: "Add Comments to Posts"

### Step 1: User Request
```
"Add comments to posts."
```

### Step 2: AI Analysis
```javascript
// AI uses APPLICATION MODEL to understand context
model.modules.find(m => m.name === "posts")
// Returns:
// {
//   baseDir: "src/modules/posts",
//   provides: ["Post model", "Posts API", "PostList component"]
// }

// Load only relevant files
const files = [
  "src/modules/posts/Post.ts",
  "src/modules/posts/postsAPI.ts",
  "src/modules/posts/PostDetail.tsx",
  "src/db/schema.ts"  // posts table
];

// ~400 lines of context
```

### Step 3: Plan (Shown to User)
```
IMPLEMENTATION PLAN

New Files:
+ src/modules/comments/Comment.ts
+ src/modules/comments/commentsAPI.ts
+ src/modules/comments/CommentThread.tsx
+ src/db/migrations/001_add_comments_table.sql

Modified Files:
~ src/modules/posts/PostDetail.tsx  (add CommentThread)
~ src/db/schema.ts                  (add comments table reference)

Database:
+ comments table
  - id (UUID, PK)
  - postId (UUID, FK → posts)
  - userId (UUID, FK → users)
  - content (TEXT)
  - createdAt (TIMESTAMP)

Tests:
+ src/modules/comments/comments.test.ts

Estimated Changes: +450 lines, ~15 minutes to integrate manually
```

### Step 4: Implementation
```typescript
// AI creates files and modifies code
// (Detailed example omitted for brevity, but includes:
//  - Comment model
//  - API routes (GET /posts/:id/comments, POST /posts/:id/comments)
//  - React component with form
//  - Database migration
//  - Tests)
```

### Step 5: Validation
```
✓ ESLint passed
✓ TypeScript passed (0 errors)
✓ Database schema valid
✓ Comments tests: 12 passed
✓ Posts tests: 8 passed
✓ Integration tests: 5 passed

BUILD: ✓ Success
```

### Step 6: Model Update
```javascript
// APPLICATION MODEL is updated
model.modules.push({
  name: "comments",
  status: "active",
  baseDir: "src/modules/comments",
  provides: ["Comment model", "Comments API", "CommentThread component"]
});

model.databases[0].schema.tables.push({
  name: "comments",
  columns: [
    { name: "id", type: "UUID", primaryKey: true },
    { name: "postId", type: "UUID", foreignKey: "posts.id" },
    // ...
  ]
});

// GRAPH is updated (if user is viewing it)
// [Posts Module] → [Comments Module]
// [Comments Module] → [PostgreSQL]
```

### Step 7: Show Results
```
✅ COMMENTS FEATURE ADDED

Files Created (3):
+ src/modules/comments/Comment.ts (45 lines)
+ src/modules/comments/commentsAPI.ts (78 lines)
+ src/modules/comments/CommentThread.tsx (92 lines)

Files Modified (2):
~ src/modules/posts/PostDetail.tsx (-2, +8 lines)
~ src/db/schema.ts (+1 line)

Database (1):
+ migrations/001_add_comments_table.sql

Tests:
✓ All passing (12 new tests)

[Review Diff] [Accept] [Ask More Questions]
```

### Step 8: User Can Now...
```javascript
// Continue with prompts
"Add email notifications when someone comments on my post"

// Continue with code
// (Edit CommentThread.tsx directly)

// Use the module system
"Migrate comments to a separate service"

// Use the graph
// (Click Comments module → "Refactor")

// Or just keep building
"Add nested replies to comments"
```

---

## APPENDIX B: Stock Modules (MVP Set)

### 1. Authentication
```
Variants:
├── JWT tokens
├── Session-based (express-session)
├── OAuth (Google, GitHub)
└── Magic links

Provides:
├── Login form
├── Registration form
├── Current user endpoint
├── Logout
└── Protected routes middleware

Includes:
├── User model + migrations
├── Auth API routes
├── Auth React components
├── Tests
└── Configuration examples
```

### 2. CRUD (Create-Read-Update-Delete)
```
Variants:
├── REST API + React UI
├── GraphQL endpoint + Apollo
├── tRPC endpoints + tRPC client
└── Next.js API routes

Provides:
├── Model (generic)
├── API routes
├── Form components (create/edit)
├── List with pagination
├── Delete with confirmation
└── Search/filter

Includes:
├── Database migration
├── Tests
└── Validation examples
```

### 3. Search & Filter
```
Provides:
├── Full-text search
├── Filter UI
├── Faceted navigation
├── Pagination
└── Highlighting

Implementations:
├── PostgreSQL (simple)
├── Elasticsearch (advanced)
└── Database-agnostic (slow)

Includes:
├── API endpoint
├── React search component
├── Tests
└── Performance notes
```

### 4. File Upload
```
Provides:
├── Upload form
├── Progress tracking
├── File validation
├── Storage abstraction

Implementations:
├── Local filesystem (dev)
├── AWS S3
├── Google Cloud Storage
└── Cloudinary

Includes:
├── Backend handler
├── React uploader component
├── Security considerations
└── Tests
```

### 5. Notifications
```
Provides:
├── In-app notifications
├── Email notifications
├── WebSocket-based real-time
└── Notification center

Includes:
├── Notification model + schema
├── API routes
├── Email templates
├── React components
├── Tests
└── Configuration (SMTP, SendGrid, etc.)
```

---

## APPENDIX C: File Structure (Typical Project)

```
my-app/
├── .codex/                          # Platform metadata
│   ├── applicationModel.json        # The core model
│   ├── moduleRegistry.json          # Installed modules
│   └── discoveryCache.json          # Cached AST/analysis
│
├── frontend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── posts/
│   │   │   └── comments/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── posts/
│   │   │   └── comments/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
├── db/
│   ├── schema/
│   │   ├── users.sql
│   │   ├── posts.sql
│   │   └── comments.sql
│   └── migrations/
│       ├── 001_initial.sql
│       ├── 002_add_comments.sql
│       └── ...
│
├── .git/
├── .gitignore
├── README.md
└── package.json (workspace)
```

---

## FINAL NOTES

### What This Spec Accomplishes

1. **Clarity** — Each section has specific, actionable guidance
2. **Realism** — Acknowledges hard problems (model discovery, module merging)
3. **Comparison** — Positions against existing tools
4. **Roadmap** — Phased implementation path
5. **Examples** — Concrete walkthroughs
6. **Principles** — Guiding philosophy (options over restrictions)

### What Remains Undefined (Intentionally)

- Specific UI/UX design (left to product/design team)
- Exact algorithm for context retrieval (can iterate)
- Deployment/infrastructure (out of scope)
- Specific LLM selection (abstraction layer allows flexibility)

### Next Steps

1. **Prototype Phase 1** (Foundation) — Build basic IDE + file editor + AI agent
2. **Test Model Discovery** — Validate that AST analysis actually works on real projects
3. **Build Validation Loop** — Integrate real TypeScript/pytest runners
4. **Gather Early Feedback** — Show to developers, iterate based on usage
5. **Refine Modules** — Build 2-3 stock modules, test non-destructive integration

This spec is **ready to engineer against**.
