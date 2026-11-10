export function startOAuthWorker(variant?: 'jwt' | 'access'): Promise<{ url: string; close(): Promise<void> }>;
