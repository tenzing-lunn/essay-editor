const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hashPassword, verifyPassword, validateSignup, validatePassword, normalizeUsername, DUMMY_HASH } = require('../lib/server/password.ts');
const { PASSWORD_MIN, PASSWORD_MAX, NAME_MAX } = require('../lib/api-types.ts');

test('passwords hash with salted scrypt and verify only the original', async () => {
  const stored = await hashPassword('correct horse battery');
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  assert.deepEqual([scheme, n, r, p], ['scrypt', '16384', '8', '1']);
  assert.equal(Buffer.from(salt, 'base64').length, 16);
  assert.equal(Buffer.from(hash, 'base64').length, 64);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterY', stored), false);
  assert.equal(await verifyPassword('', stored), false);
  assert.notEqual(await hashPassword('correct horse battery'), stored, 'each hash gets its own salt');
});

test('malformed or tampered hashes never verify', async () => {
  const stored = await hashPassword('password123');
  for (const bad of ['', 'plain', 'bcrypt$1$2$3$4$5', stored.replace('scrypt$16384', 'scrypt$abc'), stored.replace('scrypt$16384', 'scrypt$4194304'), stored.split('$').slice(0, 5).join('$'), stored.slice(0, -8) + 'AAAAAAA=']) {
    assert.equal(await verifyPassword('password123', bad), false, bad);
  }
});

test('the dummy hash costs the same as a real one and matches nothing', async () => {
  const real = await hashPassword('x'.repeat(PASSWORD_MIN));
  assert.equal(DUMMY_HASH.split('$').slice(0, 4).join('$'), real.split('$').slice(0, 4).join('$'));
  assert.equal(Buffer.from(DUMMY_HASH.split('$')[5], 'base64').length, 64);
  assert.equal(await verifyPassword('', DUMMY_HASH), false);
  assert.equal(await verifyPassword('password123', DUMMY_HASH), false);
});

test('sign-up normalizes usernames and names', () => {
  const result = validateSignup({ name: '  Ada   Lovelace ', username: '  Ada.L_99 ', password: 'password123' });
  assert.deepEqual(result, { ok: true, value: { name: 'Ada Lovelace', username: 'ada.l_99', password: 'password123' } });
  assert.equal(validateSignup({ name: 'A\u0000da', username: 'ada', password: 'password123' }).value.name, 'Ada', 'NUL is stripped');
  assert.equal(normalizeUsername(' MiXed '), 'mixed');
  assert.equal(normalizeUsername(42), '');
});

test('sign-up explains what to fix', () => {
  const ok = { name: 'Ada', username: 'ada', password: 'p'.repeat(PASSWORD_MIN) };
  assert.equal(validateSignup(ok).ok, true);
  const error = (patch) => { const r = validateSignup({ ...ok, ...patch }); assert.equal(r.ok, false, JSON.stringify(patch)); return r.error; };
  assert.match(error({ name: '   ' }), /name/);
  assert.match(error({ name: 'n'.repeat(NAME_MAX + 1) }), /name/);
  assert.equal(validateSignup({ ...ok, name: 'n'.repeat(NAME_MAX) }).ok, true);
  for (const username of ['ab', 'a'.repeat(33), '_ada', 'ada lovelace', 'ada@home', 'adà', '']) assert.match(error({ username }), /[Uu]sername/, username);
  assert.equal(validateSignup({ ...ok, username: 'a'.repeat(32) }).ok, true);
  assert.match(error({ password: 'p'.repeat(PASSWORD_MIN - 1) }), new RegExp(`at least ${PASSWORD_MIN}`));
  assert.match(error({ password: 'p'.repeat(PASSWORD_MAX + 1) }), /password/);
  assert.equal(validateSignup({ ...ok, password: 'p'.repeat(PASSWORD_MAX) }).ok, true);
  assert.match(error({ password: undefined }), /password/);
  assert.equal(validateSignup(null).ok, false);
  assert.equal(validatePassword('p'.repeat(PASSWORD_MIN)), null);
});
