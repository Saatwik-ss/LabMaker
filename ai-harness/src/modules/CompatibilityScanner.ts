import * as fs from 'fs';
import * as path from 'path';
import { ConflictStatus } from '../indexing/ModuleCatalogIndex';

export interface CompatibilityScan {
  conflictStatus: ConflictStatus;
  compatible: boolean;
  issues: string[];
  conflicts: Array<{ type: string; details: string; severity: string }>;
  detectedPatterns: string[];
  mergeChoices: Array<'keep' | 'merge' | 'replace' | 'cancel'>;
}

const AUTH_ROUTE = /\/(login|signup|register|oauth|session)/i;
const JWT = /\bjwt\b|jsonwebtoken|Bearer /i;
const SESSION = /express-session|cookie-session|req\.session/i;
const USER_SCHEMA = /create table\s+users|model\s+User\b|interface\s+User\b/i;

function walk(dir: string, ignore: string[], acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ignore, acc);
    else acc.push(full);
  }
  return acc;
}

export function scanModuleCompatibility(projectRoot: string, moduleId: string): CompatibilityScan {
  const issues: string[] = [];
  const conflicts: Array<{ type: string; details: string; severity: string }> = [];
  const detected: string[] = [];
  const files = walk(path.resolve(projectRoot), ['node_modules', '.git', 'dist', 'build', '.codex']);
  const snippets = files.slice(0, 400).map((f) => {
    try {
      return fs.readFileSync(f, 'utf8').slice(0, 8000);
    } catch {
      return '';
    }
  });
  const blob = snippets.join('\n');

  const hasJwt = JWT.test(blob);
  const hasSession = SESSION.test(blob);
  const hasAuthRoutes = AUTH_ROUTE.test(blob);
  const hasUserSchema = USER_SCHEMA.test(blob);

  if (hasJwt) detected.push('jwt');
  if (hasSession) detected.push('session');
  if (hasAuthRoutes) detected.push('auth-routes');
  if (hasUserSchema) detected.push('user-schema');

  const id = (moduleId || '').toLowerCase();
  const isAuth = id.includes('auth') || id.includes('login');
  const isCrud = id.includes('crud');

  if (isAuth && hasJwt && hasSession) {
    conflicts.push({
      type: 'auth-strategy',
      details: 'Project already uses both JWT and session patterns. Choose keep, merge, or replace.',
      severity: 'warning',
    });
  } else if (isAuth && (hasJwt || hasSession || hasAuthRoutes)) {
    conflicts.push({
      type: 'existing-auth',
      details: `Existing auth detected (${detected.join(', ') || 'routes'}). Installing another auth module may duplicate login flows.`,
      severity: 'warning',
    });
  }

  if (isCrud && /router\.(get|post|put|delete)/i.test(blob)) {
    detected.push('existing-rest-routes');
  }

  const conflictStatus: ConflictStatus = conflicts.length > 0 ? 'conflict' : 'compatible';
  if (conflicts.length > 0) {
    issues.push(...conflicts.map((c) => c.details));
  }

  return {
    conflictStatus,
    compatible: conflicts.every((c) => c.severity !== 'error'),
    issues,
    conflicts,
    detectedPatterns: detected,
    mergeChoices: ['keep', 'merge', 'replace', 'cancel'],
  };
}
