export type LocalPrincipal = 'reader' | 'admin' | 'collector' | 'anonymous';
export interface LocalInstrumentServer {
  url: string;
  address: { address: string; port: number; family: string };
  role: LocalPrincipal;
  close(): Promise<void>;
}
export function startLocalInstrumentServer(options?: { principal?: LocalPrincipal; port?: number; repository?: import('../../src/ports/instruments').InstrumentRepository }): Promise<LocalInstrumentServer>;
export function probeLocalRequest(url: string, headers: Record<string, string>): Promise<number>;
