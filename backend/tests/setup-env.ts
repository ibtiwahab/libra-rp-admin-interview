process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-session-secret-0123456789abcdef0123456789';
process.env.MFA_ENCRYPTION_KEY ??= 'test-mfa-key-0123456789abcdef0123456789abcdef';
process.env.FRONTEND_URL ??= 'http://localhost:3000';
process.env.DISABLE_JOBS = 'true';
process.env.HEARTBEAT_TIMEOUT_SECONDS ??= '25';
process.env.SUBMISSION_GRACE_MS ??= '1500';
process.env.LOGIN_MAX_FAILURES ??= '5';
