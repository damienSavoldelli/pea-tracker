export function startD1ServerProcess(directory: string): Promise<{ url: string; stop(): Promise<void> }>;
