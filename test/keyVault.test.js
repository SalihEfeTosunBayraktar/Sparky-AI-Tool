'use strict';

const test = require('node:test');
const assert = require('node:assert');

const KeyVault = require('../src/main/keyVault');

test('=== Running KeyVault Secret Encryption Unit Tests ===', async (t) => {
  await t.test('1. Key Masking: masks secrets properly', () => {
    assert.strictEqual(KeyVault.maskKey('sk-ant-api03-123456789'), '••••6789');
    assert.strictEqual(KeyVault.maskKey('1234'), '••••');
    assert.strictEqual(KeyVault.maskKey(''), '••••');
    assert.strictEqual(KeyVault.maskKey(null), '••••');
  });

  await t.test('2. Encryption & Decryption roundtrip (Fallback / Headless)', () => {
    const rawKey = 'sk-proj-test-secret-key-12345';
    const { cipher, isEncrypted } = KeyVault.encrypt(rawKey);

    assert.ok(cipher.length > 0);
    assert.notStrictEqual(cipher, rawKey);

    const decrypted = KeyVault.decrypt(cipher, isEncrypted);
    assert.strictEqual(decrypted, rawKey);
  });

  await t.test('3. Edge Cases: handles empty, null and corrupt ciphertext safely', () => {
    assert.strictEqual(KeyVault.decrypt('', true), '');
    assert.strictEqual(KeyVault.decrypt(null, true), '');
    const res = KeyVault.encrypt('');
    assert.strictEqual(res.cipher, '');
  });
});
