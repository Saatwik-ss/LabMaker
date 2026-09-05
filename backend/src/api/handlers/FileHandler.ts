import { Router, Request, Response, NextFunction } from 'express';
import { FileOperations } from '../../tools/FileOperations';
import { EditSnapshotStore } from '../../core/EditSnapshotStore';
import * as fs from 'fs';
import * as path from 'path';
import { ZipArchive } from 'archiver';

export function createFileHandler(fileOperations: FileOperations, editSnapshots?: EditSnapshotStore): Router {
  const router = Router();

  // GET /download?path=... - download single file or entire zipped folder
  router.get('/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetPath = (req.query.path as string) || '.';
      const absPath = fileOperations.getAbsolutePath(targetPath);

      if (!fs.existsSync(absPath)) {
        return res.status(404).json({ success: false, error: `Path not found: ${targetPath}` });
      }

      const stat = fs.statSync(absPath);
      const baseName = path.basename(absPath) || 'workspace';

      if (stat.isFile()) {
        // Direct file download
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(baseName)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        const fileStream = fs.createReadStream(absPath);
        fileStream.pipe(res);
      } else if (stat.isDirectory()) {
        // Zipped folder download
        const zipFileName = baseName === '.' || baseName === '' ? 'workspace.zip' : `${baseName}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFileName)}"`);
        res.setHeader('Content-Type', 'application/zip');

        const archive = new ZipArchive({
          zlib: { level: 9 } // Highest compression
        });

        archive.on('error', (err: any) => {
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
          }
        });

        archive.pipe(res);

        // Include directory contents, skipping node_modules and .git for speed & size
        archive.glob('**/*', {
          cwd: absPath,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.system_generated/**'],
          dot: true
        });

        await archive.finalize();
      }
    } catch (error) {
      next(error);
    }
  });

  // GET /tree?path=... - list directory (defaults to project root)
  router.get('/tree', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dirPath = (req.query.path as string) || '.';
      const tree = fileOperations.listDirectory(dirPath);
      res.json(tree);
    } catch (error) {
      next(error);
    }
  });

  // GET /read?path=... - read file content
  router.get('/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'path query parameter is required' });
      }

      const result = fileOperations.readFile(filePath);
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // POST /write - write file content
  router.post('/write', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { path, content } = req.body;
      if (!path || content === undefined) {
        return res.status(400).json({ success: false, error: 'path and content are required' });
      }

      const result = fileOperations.writeFile(path, content);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /?path=... - delete file
  router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'path query parameter is required' });
      }

      if (!fileOperations.exists(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      const result = fileOperations.deleteFile(filePath);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // POST /create - create new file or directory
  router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { path: itemPath, isDirectory } = req.body;
      if (!itemPath) {
        return res.status(400).json({ success: false, error: 'path is required' });
      }

      if (isDirectory) {
        const result = fileOperations.createDirectory(itemPath);
        return res.json(result);
      } else {
        const result = fileOperations.writeFile(itemPath, '');
        return res.json(result);
      }
    } catch (error) {
      next(error);
    }
  });

  // POST /upload - add/import file from local machine into project filesystem
  router.post('/upload', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { path: filePath, content, isBase64 } = req.body;
      if (!filePath || content === undefined) {
        return res.status(400).json({ success: false, error: 'path and content are required' });
      }

      let fileData = content;
      if (isBase64) {
        fileData = Buffer.from(content, 'base64').toString('utf8');
      }

      const result = fileOperations.writeFile(filePath, fileData);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
