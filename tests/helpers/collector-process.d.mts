export const collectorPythonAvailable: boolean;
export function collectorProcess(): Promise<{
  execute(token: string, origin: string, cycle?: string): Promise<{ code: number; stdout: string; stderr: string }>;
  executeAccess(credentials: { clientId: string; clientSecret: string }, origin: string, cycle?: string): Promise<{ code: number; stdout: string; stderr: string }>;
  close(): Promise<void>;
}>;
