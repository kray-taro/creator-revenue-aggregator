export interface IEncryptionService {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
}
