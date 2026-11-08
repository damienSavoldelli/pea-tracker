import { describe, expect, it, vi } from 'vitest';
import { authorizeAccess, requirePermission } from '../src/application/authorization';
import { InstrumentService } from '../src/application/instruments';
import { MemoryInstrumentRepository } from '../src/adapters/memory/instruments';
import { resourcePolicies } from '../src/adapters/auth/resource-policy';
import { policies } from './helpers/auth-fixtures';
import { syntheticInput } from './helpers/instruments';

describe('resource authorization policies', () => {
  it('keeps MCP read capabilities below admin even for broad token scopes', async () => {
    const policy = policies().mcp;
    const principal = authorizeAccess({ subject: policy.owner.subject, clientId: 'synthetic-mcp', scopes: ['mcp:read', 'portfolio:read', 'portfolio:admin', 'quotes:ingest'] }, policy);
    expect(principal.permissions).toEqual(['instruments:read']);
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.isFrozen(principal.permissions)).toBe(true);
    const repository = new MemoryInstrumentRepository();
    const write = vi.spyOn(repository, 'create');
    await expect(new InstrumentService(repository).create(principal, syntheticInput, 'denied')).rejects.toMatchObject({ status: 403 });
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps collector capabilities independent of human/admin permissions', () => {
    const principal = authorizeAccess({ subject: 'synthetic-machine', clientId: 'synthetic-collector', scopes: ['quotes:ingest', 'portfolio:read', 'portfolio:admin'] }, policies().collector);
    expect(principal.permissions).toEqual(['quotes:ingest']);
    expect(() => requirePermission(principal, 'instruments:read')).toThrow('forbidden');
    expect(() => requirePermission(principal, 'instruments:admin')).toThrow('forbidden');
  });
  it.each([
    { subject: 'synthetic-intruder', clientId: 'synthetic-admin', scopes: ['portfolio:admin'] },
    { subject: 'synthetic-external-owner', clientId: 'unknown', scopes: ['portfolio:admin'] },
    { subject: 'synthetic-external-owner', clientId: 'synthetic-reader', scopes: ['portfolio:admin'] },
    { subject: 'synthetic-external-owner', clientId: 'synthetic-admin', scopes: ['portfolio:*'] },
  ])('denies owner/client/scope substitution %j', identity => {
    expect(() => authorizeAccess(identity, policies().rest)).toThrow();
  });
  it('admin-only grants do not imply reads and identity remains stable across clients', () => {
    const p = policies().rest;
    const admin = authorizeAccess({ subject: p.owner.subject, clientId: 'synthetic-admin', scopes: ['portfolio:admin'] }, p);
    const reader = authorizeAccess({ subject: p.owner.subject, clientId: 'synthetic-reader', scopes: ['portfolio:read'] }, p);
    expect(admin.permissions).toEqual(['instruments:admin']);
    expect(admin.subject).toBe(reader.subject);
  });
  it('copies and freezes validated configuration, rejects crossed resource grants', () => {
    const input = policies();
    const copy = resourcePolicies(input);
    Object.defineProperty(input.rest.owner, 'subject', { value: 'changed' });
    expect(copy.rest.owner.subject).toBe('synthetic-external-owner');
    const crossed = policies();
    const invalid = { ...crossed, mcp: { ...crossed.mcp, clients: [{ id: 'bad', scopes: ['portfolio:admin'] }] } };
    expect(() => resourcePolicies(invalid)).toThrow();
  });
});
