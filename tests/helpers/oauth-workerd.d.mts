export function startOAuthWorker(): Promise<{ url: string; close(): Promise<void> }>;
