import path from 'path';
import { Umzug } from 'umzug';

export interface IMigrationDbClient {
  query(sql: string): Promise<unknown>;
}

export const createMigrationRunner = (dbClient: IMigrationDbClient): Umzug<IMigrationDbClient> => {
  return new Umzug<IMigrationDbClient>({
    context: dbClient,
    logger: console,
    migrations: {
      glob: path.join(__dirname, '*.sql'),
      resolve: ({ name, path: migrationPath, context }) => ({
        name,
        up: async () => {
          const fs = await import('fs/promises');
          if (!migrationPath) {
            throw new Error(`Missing migration path for ${name}`);
          }
          const sql = await fs.readFile(migrationPath, 'utf8');
          await context.query(sql);
        },
        down: async () => {
          // Sprint 1 scope: forward-only migrations
          return;
        },
      }),
    },
  });
};
