export interface LocalD1 {
  db: D1Database;
  directory: string;
  dispose(): Promise<void>;
  cleanup(): Promise<void>;
}
export const projectRoot: string;
export function assertLocalD1Config(): Promise<unknown>;
export function readPersistenceProbe(directory: string): Promise<unknown>;
export function runLocalMigrations(directory: string, options?: { migrationsDirectory?: string }): Promise<{ stdout: string; stderr: string }>;
export function openLocalD1(options?: { directory?: string; migrate?: boolean }): Promise<LocalD1>;
