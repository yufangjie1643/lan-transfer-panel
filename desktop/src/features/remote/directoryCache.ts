import type { SshDirectoryListing } from './sshRemote';

export interface CachedDirectory {
  listing: SshDirectoryListing;
  timestamp: number;
}

export class DirectoryCache {
  private cache = new Map<string, CachedDirectory>();

  key(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  }

  get(path: string, ttlMs: number): SshDirectoryListing | undefined {
    const entry = this.cache.get(this.key(path));
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(this.key(path));
      return undefined;
    }
    return entry.listing;
  }

  set(path: string, listing: SshDirectoryListing): void {
    this.cache.set(this.key(path), { listing, timestamp: Date.now() });
  }

  has(path: string): boolean {
    return this.cache.has(this.key(path));
  }

  paths(): string[] {
    return Array.from(this.cache.keys());
  }

  clear(): void {
    this.cache.clear();
  }

  delete(path: string): void {
    this.cache.delete(this.key(path));
  }
}
