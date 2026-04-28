import * as crypto from 'crypto';
import type { IEncryptionService } from '../../domain/ports/IEncryptionService';
import type { IConfig } from '../../domain/ports/IConfig';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * AES-256-GCM encryption service.
 * Key material is sourced from configuration (never hardcoded).
 */
export class AesEncryptionService implements IEncryptionService {
  private readonly key: Buffer;

  constructor(config: IConfig) {
    this.key = crypto.createHash('sha256').update(config.encryptionKey, 'utf8').digest();
  }

  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  decrypt(cipherText: string): string {
    const [ivEncoded, authTagEncoded, encryptedEncoded] = cipherText.split('.');

    if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
      throw new Error('Invalid cipherText format.');
    }

    const iv = Buffer.from(ivEncoded, 'base64');
    const authTag = Buffer.from(authTagEncoded, 'base64');
    const encrypted = Buffer.from(encryptedEncoded, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
