import * as crypto from 'crypto';

const KEY_LENGTH = 64;
const SEPARATOR = ':';

/**
 * bcrypt-equivalent password hashing using Node's built-in crypto.scrypt.
 * scrypt is a memory-hard KDF (key derivation function) suitable for password storage.
 *
 * Format stored in DB: `scrypt:salt_hex:hash_hex`
 * This is self-describing so that parameters can be updated in future without
 * breaking verification of existing hashes.
 *
 * Design: no external dependencies (avoids native bcrypt build issues in CI/Docker).
 */
export class PasswordService {
  /**
   * Hashes a plaintext password. Safe to store in DB.
   */
  async hash(plaintext: string): Promise<string> {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = await this.deriveKey(plaintext, salt);
    return [`scrypt`, salt, hash].join(SEPARATOR);
  }

  /**
   * Timing-safe comparison of a plaintext password against a stored hash.
   */
  async verify(plaintext: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split(SEPARATOR);
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    const salt = parts[1] as string;
    const expected = parts[2] as string;

    const actual = await this.deriveKey(plaintext, salt);

    // Timing-safe comparison prevents timing attacks
    const expectedBuf = Buffer.from(expected, 'hex');
    const actualBuf = Buffer.from(actual, 'hex');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  private deriveKey(plaintext: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(
        plaintext,
        salt,
        KEY_LENGTH,
        { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
        (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            resolve(derivedKey.toString('hex'));
          }
        }
      );
    });
  }
}
