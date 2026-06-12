import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Minimal synchronous JSON-file store for settings, window state and tokens.
 * Kept dependency-free to minimize footprint and startup time.
 */
export class JsonStore<T extends object> {
  private readonly path: string;
  private data: T;

  constructor(filename: string, defaults: T) {
    this.path = join(app.getPath('userData'), filename);
    this.data = { ...defaults };
    try {
      if (existsSync(this.path)) {
        this.data = { ...defaults, ...JSON.parse(readFileSync(this.path, 'utf8')) };
      }
    } catch (err) {
      console.warn(`Failed to read store ${filename}, using defaults:`, err);
    }
  }

  get(): T {
    return this.data;
  }

  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch };
    this.save();
    return this.data;
  }

  replace(data: T): void {
    this.data = data;
    this.save();
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error(`Failed to write store ${this.path}:`, err);
    }
  }
}
