import {
  ApplicationModel,
  Backend,
  Database,
  InstalledModule,
  FrontendStack,
  ServiceNode,
  Relationship,
} from '@codex/shared';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

export class ApplicationModelManager {
  private model: ApplicationModel;
  private dirty: boolean;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ApplicationModel');
    this.model = this.createEmptyModel();
    this.dirty = false;
  }

  private createEmptyModel(): ApplicationModel {
    return {
      metadata: {
        name: '',
        description: '',
        version: '0.1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      stack: {
        frontend: null,
        backends: [],
        databases: [],
        ai: [],
      },
      modules: [],
      architecture: {
        services: [],
        relationships: [],
        dataFlow: [],
      },
      files: {
        projectRoot: '.',
        importantPaths: [],
        moduleRoots: [],
        configFiles: [],
      },
      discoveryMetadata: {
        lastDiscoveredAt: '',
        discoveryVersion: '1.0.0',
        parserVersion: '1.0.0',
      },
    };
  }

  public setFrontendStack(stack: FrontendStack): void {
    this.model.stack.frontend = stack;
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  public addBackend(backend: Backend): void {
    this.model.stack.backends.push(backend);
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  public addDatabase(db: Database): void {
    this.model.stack.databases.push(db);
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  public addModule(module: InstalledModule): void {
    this.model.modules.push(module);
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  public getModuleByName(name: string): InstalledModule | undefined {
    return this.model.modules.find((m) => m.name === name);
  }

  public updateModuleStatus(
    moduleId: string,
    status: 'active' | 'deprecated' | 'replaced'
  ): void {
    const mod = this.model.modules.find((m) => m.id === moduleId);
    if (mod) {
      mod.status = status;
      this.model.metadata.updatedAt = new Date().toISOString();
      this.dirty = true;
    }
  }

  public removeModule(idOrName: string): void {
    this.model.modules = this.model.modules.filter((m) => m.id !== idOrName && m.name !== idOrName);
    this.model.architecture.services = this.model.architecture.services.filter(
      (s) => s.id !== idOrName && s.name !== idOrName
    );
    this.model.architecture.relationships = this.model.architecture.relationships.filter(
      (r) => r.source !== idOrName && r.target !== idOrName
    );
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  public getBackends(): Backend[] {
    return this.model.stack.backends;
  }

  public getDatabases(): Database[] {
    return this.model.stack.databases;
  }

  public addService(service: ServiceNode): void {
    // Avoid duplicate IDs
    this.model.architecture.services = this.model.architecture.services.filter(s => s.id !== service.id);
    this.model.architecture.services.push(service);
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  public updateService(id: string, updates: Partial<ServiceNode>): boolean {
    const service = this.model.architecture.services.find(s => s.id === id);
    if (!service) return false;
    Object.assign(service, updates);
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
    return true;
  }

  public removeService(id: string): boolean {
    const initialLen = this.model.architecture.services.length;
    this.model.architecture.services = this.model.architecture.services.filter(s => s.id !== id);
    // Also remove any attached relationships
    this.model.architecture.relationships = this.model.architecture.relationships.filter(
      r => r.source !== id && r.target !== id
    );
    if (this.model.architecture.services.length !== initialLen) {
      this.model.metadata.updatedAt = new Date().toISOString();
      this.dirty = true;
      return true;
    }
    return false;
  }

  public addRelationship(rel: Relationship): void {
    this.model.architecture.relationships = this.model.architecture.relationships.filter(r => r.id !== rel.id);
    this.model.architecture.relationships.push(rel);
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  public updateRelationship(id: string, updates: Partial<Relationship>): boolean {
    const rel = this.model.architecture.relationships.find(r => r.id === id);
    if (!rel) return false;
    Object.assign(rel, updates);
    this.model.metadata.updatedAt = new Date().toISOString();
    this.dirty = true;
    return true;
  }

  public removeRelationship(id: string): boolean {
    const initialLen = this.model.architecture.relationships.length;
    this.model.architecture.relationships = this.model.architecture.relationships.filter(r => r.id !== id);
    if (this.model.architecture.relationships.length !== initialLen) {
      this.model.metadata.updatedAt = new Date().toISOString();
      this.dirty = true;
      return true;
    }
    return false;
  }

  public toJSON(): string {
    return JSON.stringify(this.model, null, 2);
  }

  public loadFromJSON(json: string): void {
    try {
      const parsed = JSON.parse(json);
      // Merge with empty model to ensure all fields exist
      this.model = { ...this.createEmptyModel(), ...parsed };
      if (parsed.stack) {
        this.model.stack = { ...this.createEmptyModel().stack, ...parsed.stack };
      }
      if (parsed.architecture) {
        this.model.architecture = { ...this.createEmptyModel().architecture, ...parsed.architecture };
      }
      if (parsed.metadata) {
        this.model.metadata = { ...this.createEmptyModel().metadata, ...parsed.metadata };
      }
      this.dirty = false;
    } catch (e) {
      this.logger.error('Failed to parse JSON for ApplicationModel', e);
    }
  }

  public loadFromFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        this.loadFromJSON(data);
        this.dirty = false;
        this.logger.info(`Loaded ApplicationModel from ${filePath}`);
      } else {
        this.logger.info(`No existing ApplicationModel found at ${filePath}, using empty model.`);
      }
    } catch (error) {
      this.logger.error(`Error loading ApplicationModel from ${filePath}:`, error);
    }
  }

  public saveToFile(filePath: string): void {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, this.toJSON(), 'utf-8');
      this.markSaved();
      this.logger.info(`Saved ApplicationModel to ${filePath}`);
    } catch (error) {
      this.logger.error(`Error saving ApplicationModel to ${filePath}:`, error);
    }
  }

  public markSaved(): void {
    this.dirty = false;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public getSummary(): object {
    return {
      name: this.model.metadata.name,
      description: this.model.metadata.description,
      version: this.model.metadata.version,
      frontend: this.model.stack.frontend?.framework || 'none',
      backendCount: this.model.stack.backends.length,
      databaseCount: this.model.stack.databases.length,
      moduleCount: this.model.modules.length,
      serviceCount: this.model.architecture.services.length,
      relationshipCount: this.model.architecture.relationships.length,
      updatedAt: this.model.metadata.updatedAt,
    };
  }

  public getModel(): ApplicationModel {
    return this.model;
  }
}
