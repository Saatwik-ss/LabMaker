import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export function createSettingsHandler(projectRoot: string): Router {
  const router = Router();
  const configDir = path.join(projectRoot, '.codex');
  const configPath = path.join(configDir, 'config.json');

  function readConfig(): Record<string, any> {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  function writeConfig(config: Record<string, any>): void {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  // GET /settings - read all settings
  router.get('/', (req: Request, res: Response) => {
    const config = readConfig();
    // Mask API keys in response
    const masked = { ...config };
    if (masked.openaiApiKey) masked.openaiApiKey = '***' + masked.openaiApiKey.slice(-4);
    if (masked.anthropicApiKey) masked.anthropicApiKey = '***' + masked.anthropicApiKey.slice(-4);
    if (masked.groqApiKey) masked.groqApiKey = '***' + masked.groqApiKey.slice(-4);
    res.json(masked);
  });

  // PUT /settings - update settings
  router.put('/', (req: Request, res: Response) => {
    const current = readConfig();
    const updates = req.body;
    // Only update provided fields, don't clear existing ones
    const merged = { ...current, ...updates };
    writeConfig(merged);
    res.json({ success: true });
  });

  // GET /settings/raw - read settings with full keys (for agent use only)
  router.get('/raw', (req: Request, res: Response) => {
    const config = readConfig();
    res.json(config);
  });

  return router;
}
