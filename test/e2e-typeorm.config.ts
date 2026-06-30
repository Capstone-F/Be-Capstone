import { join } from 'path';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export const e2eTypeOrmConfig: PostgresConnectionOptions = {
  type: 'postgres',
  url:
    process.env.DATABASE_URL ??
    'postgresql://admin:admin@localhost:5432/be-capstone',
  entities: [join(__dirname, '../src/**/*.entity.ts')],
  synchronize: true,
  dropSchema: true,
};
