export function startD1ServerProcess(directory: string, portfolio?: boolean): Promise<{ url: string; stop(): Promise<void> }>;
