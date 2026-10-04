#!/usr/bin/env node
import { AIHarness } from '../harness/AIHarness';
import { CodexMcpServer } from './CodexMcpServer';
import * as path from 'path';
import * as fs from 'fs';

function findCatalogRoot(start: string): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'module-library');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(start, 'module-library');
}

const projectRoot = process.env.CODEX_PROJECT_ROOT || process.cwd();
const catalogRoot = process.env.CODEX_CATALOG_ROOT || findCatalogRoot(projectRoot);
const harness = new AIHarness(projectRoot);
harness.setCatalogRoot(catalogRoot);
const registry = harness.getToolRegistry();
if (!registry) {
  process.stderr.write('Failed to create Codex tool registry\n');
  process.exit(1);
}
new CodexMcpServer(registry).startStdio();
