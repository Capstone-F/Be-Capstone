import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';

config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for TypeORM CLI');
}

const runningFromDist = __filename.endsWith('.js');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  entities: [
    join(
      __dirname,
      runningFromDist ? '/../**/*.entity.js' : '/../**/*.entity.ts',
    ),
  ],
  migrations: [
    join(__dirname, runningFromDist ? '/migrations/*.js' : '/migrations/*.ts'),
  ],
});
