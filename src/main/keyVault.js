'use strict';

/**
 * KeyVault — Hardware-accelerated / OS Keychain Secret Storage Service.
 * Windows DPAPI ve macOS Keychain destekli safeStorage anahtar kasası.
 */

const { safeStorage } = require('electron');

class KeyVault {
  /**
   * Checks whether hardware/OS-level encryption is available on the host system.
   * Şifrelemenin kullanılabilir olup olmadığını denetler.
   * @returns {boolean}
   */
  static isAvailable() {
    try {
      return !!(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  }

  /**
   * Encrypts plaintext string into base64 encoded ciphertext buffer.
   * Açık metni şifreleyerek Base64 dizesine dönüştürür.
   * @param {string} plainText
   * @returns {{ cipher: string, isEncrypted: boolean }}
   */
  static encrypt(plainText) {
    if (!plainText || typeof plainText !== 'string') {
      return { cipher: '', isEncrypted: false };
    }

    if (this.isAvailable()) {
      try {
        const buffer = safeStorage.encryptString(plainText);
        return {
          cipher: buffer.toString('base64'),
          isEncrypted: true
        };
      } catch (err) {
        console.warn('[KeyVault] Encryption failed, falling back to obfuscation:', err.message);
      }
    }

    // Fallback obfuscation for headless or non-keychain environments
    const encoded = Buffer.from(plainText, 'utf8').toString('base64');
    return { cipher: encoded, isEncrypted: false };
  }

  /**
   * Decrypts ciphertext base64 into plaintext string.
   * Şifreli Base64 verisini çözerek açık metne dönüştürür.
   * @param {string} cipherText
   * @param {boolean} isEncrypted
   * @returns {string}
   */
  static decrypt(cipherText, isEncrypted = true) {
    if (!cipherText || typeof cipherText !== 'string') return '';

    if (isEncrypted && this.isAvailable()) {
      try {
        const buffer = Buffer.from(cipherText, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (err) {
        console.error('[KeyVault] Decryption failed:', err.message);
        return '';
      }
    }

    // Fallback decoding
    try {
      return Buffer.from(cipherText, 'base64').toString('utf8');
    } catch {
      return cipherText;
    }
  }

  /**
   * Masks secret key showing only last 4 characters.
   * Anahtarın sadece son 4 karakterini gösteren maske üretir.
   * @param {string} key
   * @returns {string}
   */
  static maskKey(key) {
    if (!key || typeof key !== 'string') return '••••';
    const trimmed = key.trim();
    if (trimmed.length <= 4) return '••••';
    return `••••${trimmed.slice(-4)}`;
  }
}

module.exports = KeyVault;
