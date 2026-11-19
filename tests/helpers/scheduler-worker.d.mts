export function startSchedulerWorker(enabled?: boolean): Promise<{
  calls(): number;
  dispatch(): Promise<{ status: number; event: string | null }>;
  publicStatus(): Promise<number>;
  close(): Promise<void>;
}>;
