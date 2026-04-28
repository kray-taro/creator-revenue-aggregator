export interface IConfig {
  readonly dbUrl: string;
  readonly redisUrl: string;
  readonly appSecret: string;
  readonly encryptionKey: string;
  readonly nodeEnv: 'development' | 'test' | 'production';
}
