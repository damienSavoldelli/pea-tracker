export const service = { status: 'ok', service: 'pea-tracker', version: '0.1.0' } as const;

export function pingDiagnostic() {
  return { ...service, timestamp: new Date().toISOString() };
}
