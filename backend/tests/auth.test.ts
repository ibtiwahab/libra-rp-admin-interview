import { describe, expect, it } from 'vitest';
import { SecurityEvent, Session, User } from '../src/models';
import { currentTotp } from '../src/security/totp';
import { Client, HEAD, adminClient, candidateClient, createAdmin, createCandidate, headAdmin, useDatabase } from './helpers';

useDatabase();

describe('administrative authentication', () => {
  it('signs in a Head Admin and returns the profile', async () => {
    const c = await headAdmin();
    const me = await c.get('/api/auth/me?portal=admin');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ username: HEAD.username, role: 'HEAD_ADMIN' });
    expect(me.body.user.passwordHash).toBeUndefined();
    expect(await SecurityEvent.countDocuments({ eventType: 'LOGIN_SUCCESS' })).toBe(1);
  });

  it('sets hardened session cookies', async () => {
    await createAdmin();
    const c = await new Client().init();
    const res = await c.post('/api/auth/login', { portal: 'admin', ...HEAD });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((v) => v.startsWith('libra_admin='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('rejects invalid credentials without revealing which part was wrong', async () => {
    await createAdmin();
    const c = await new Client().init();
    const wrongPw = await c.post('/api/auth/login', { portal: 'admin', username: HEAD.username, password: 'nope-nope-nope' });
    const unknown = await c.post('/api/auth/login', { portal: 'admin', username: 'ghost', password: 'nope-nope-nope' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error.code).toBe(unknown.body.error.code);
    expect(await SecurityEvent.countDocuments({ eventType: 'LOGIN_FAILED' })).toBe(2);
  });

  it('locks an account after repeated failures (brute-force protection)', async () => {
    await createAdmin();
    const c = await new Client().init();
    for (let i = 0; i < 5; i++) await c.post('/api/auth/login', { portal: 'admin', username: HEAD.username, password: 'wrong-password-x' });
    const locked = await c.post('/api/auth/login', { portal: 'admin', ...HEAD });
    expect(locked.status).toBe(423);
    expect(await SecurityEvent.countDocuments({ eventType: 'ACCOUNT_LOCKED' })).toBe(1);
  });

  it('rejects state-changing requests without a valid CSRF token', async () => {
    await createAdmin();
    const c = await new Client().init();
    const noToken = await c.agent.post('/api/auth/login').send({ portal: 'admin', ...HEAD });
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('CSRF_INVALID');
    const forged = await c.agent.post('/api/auth/login').set('X-CSRF-Token', 'abc.def').send({ portal: 'admin', ...HEAD });
    expect(forged.status).toBe(403);
    const badOrigin = await c.agent.post('/api/auth/login').set('X-CSRF-Token', c.csrf).set('Origin', 'https://evil.example').send({ portal: 'admin', ...HEAD });
    expect(badOrigin.status).toBe(403);
  });

  it('revokes the session on logout', async () => {
    const c = await headAdmin();
    expect((await c.post('/api/auth/logout', { portal: 'admin' })).status).toBe(204);
    expect((await c.get('/api/candidates')).status).toBe(401);
    expect(await Session.countDocuments({ status: 'REVOKED', revokedReason: 'LOGOUT' })).toBe(1);
  });

  it('rejects expired sessions', async () => {
    const c = await headAdmin();
    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await c.get('/api/candidates');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('SESSION_INVALID');
  });

  it('rejects sessions revoked server-side (e.g. account disabled)', async () => {
    const c = await headAdmin();
    await Session.updateMany({}, { $set: { status: 'REVOKED' } });
    expect((await c.get('/api/candidates')).status).toBe(401);
  });

  it('supports TOTP multi-factor authentication for administrators', async () => {
    const c = await headAdmin();
    const setup = await c.post('/api/auth/mfa/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect((await c.post('/api/auth/mfa/enable', { code: '000000' })).status).toBe(400);
    expect((await c.post('/api/auth/mfa/enable', { code: currentTotp(setup.body.secret) })).status).toBe(204);

    const fresh = await new Client().init();
    const first = await fresh.post('/api/auth/login', { portal: 'admin', ...HEAD });
    expect(first.body.status).toBe('MFA_REQUIRED');
    // a pending-MFA session is not a usable admin session
    expect((await fresh.get('/api/candidates')).status).toBe(401);
    expect((await fresh.post('/api/auth/mfa/verify', { code: '123456' })).status).toBe(401);
    const ok = await fresh.post('/api/auth/mfa/verify', { code: currentTotp(setup.body.secret) });
    expect(ok.status).toBe(200);
    expect((await fresh.get('/api/candidates')).status).toBe(200);
    const stored = await User.findOne({ username: HEAD.username }).select('+mfa.secretEnc').lean();
    expect(stored!.mfa!.secretEnc).not.toContain(setup.body.secret);
  });

  it('never stores plaintext passwords', async () => {
    await createAdmin();
    const u = await User.findOne({ username: HEAD.username }).select('+passwordHash').lean();
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe('candidate authentication & isolation', () => {
  it('candidate credentials work only on the candidate portal', async () => {
    const admin = await headAdmin();
    const { credentials } = await createCandidate(admin);
    expect(credentials.username).toMatch(/^LIBRA-ADMIN-\d{4}$/);
    expect(credentials.password).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/);

    const asAdmin = await new Client().init();
    expect((await asAdmin.post('/api/auth/login', { portal: 'admin', ...credentials })).status).toBe(401);
    const cand = await candidateClient(credentials);
    expect((await cand.get('/api/exam/status')).status).toBe(200);
  });

  it('candidates cannot reach any administrative endpoint', async () => {
    const admin = await headAdmin();
    const { credentials } = await createCandidate(admin);
    const cand = await candidateClient(credentials);
    for (const path of ['/api/candidates', '/api/questions', '/api/interviews', '/api/curators', '/api/analytics/overview', '/api/logs/audit', '/api/monitor/active', '/api/evaluations']) {
      expect((await cand.get(path)).status, path).toBe(401);
    }
    expect((await cand.post('/api/questions', { title: 'x' })).status).toBe(401);
  });

  it('administrators cannot use the candidate exam API', async () => {
    const admin = await headAdmin();
    expect((await admin.get('/api/exam/status')).status).toBe(401);
  });

  it('generated credentials are shown once and stored hashed', async () => {
    const admin = await headAdmin();
    const { candidate, credentials } = await createCandidate(admin);
    const profile = await admin.get(`/api/candidates/${candidate.id}`);
    expect(JSON.stringify(profile.body)).not.toContain(credentials.password);
  });

  it('replacing credentials invalidates the old password and sessions', async () => {
    const admin = await headAdmin();
    const { candidate, credentials } = await createCandidate(admin);
    const cand = await candidateClient(credentials);
    const regen = await admin.post(`/api/candidates/${candidate.id}/credentials`);
    expect(regen.status).toBe(200);
    expect((await cand.get('/api/exam/status')).status).toBe(401);
    const old = await new Client().init();
    expect((await old.post('/api/auth/login', { portal: 'candidate', ...credentials })).status).toBe(401);
    await candidateClient(regen.body.credentials);
  });

  it('disabled curators cannot sign in', async () => {
    await createAdmin('curator1', 'Curator-Passw0rd!x', 'SUPPORT_CURATOR');
    await User.updateOne({ username: 'curator1' }, { $set: { status: 'DISABLED' } });
    const c = await new Client().init();
    expect((await c.post('/api/auth/login', { portal: 'admin', username: 'curator1', password: 'Curator-Passw0rd!x' })).status).toBe(403);
    await expect(adminClient('curator1', 'Curator-Passw0rd!x')).rejects.toThrow();
  });
});
