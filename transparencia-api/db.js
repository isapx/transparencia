import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const requiredDatabaseSettings = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingSettings = requiredDatabaseSettings.filter(name => !process.env[name]);
if (missingSettings.length > 0) {
  throw new Error(`Faltan variables de base de datos: ${missingSettings.join(', ')}`);
}

const port = Number(process.env.DB_PORT || 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DB_PORT debe ser un puerto válido.');
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 50,
  connectTimeout: 10000,
  enableKeepAlive: true
});