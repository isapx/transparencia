import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { migrateSchema } from './schema.js';

dotenv.config();

const hasMigrationUser = Boolean(process.env.DB_MIGRATION_USER);
const hasMigrationPassword = Boolean(process.env.DB_MIGRATION_PASSWORD);
if (hasMigrationUser !== hasMigrationPassword) {
  throw new Error('Configura DB_MIGRATION_USER y DB_MIGRATION_PASSWORD juntos.');
}

const port = Number(process.env.DB_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DB_PORT debe ser un puerto válido.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_MIGRATION_USER || process.env.DB_USER,
  password: process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 1,
  connectTimeout: 10000
});

try {
  await migrateSchema(pool);
  console.log('Migración completada.');
} catch (error) {
  console.error('Error al migrar la base de datos:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
