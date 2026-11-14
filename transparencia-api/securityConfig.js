import { randomBytes } from 'node:crypto';
import './env.js';

const configuredSecret = process.env.JWT_SECRET;
const isValidSecret = typeof configuredSecret === 'string'
  && Buffer.byteLength(configuredSecret, 'utf8') >= 32;

if (process.env.NODE_ENV === 'development' && !isValidSecret) {
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  console.warn('JWT_SECRET faltante o corto; se usará una clave temporal de desarrollo. Las sesiones se invalidarán al reiniciar.');
} else if (!isValidSecret) {
  throw new Error('JWT_SECRET debe contener al menos 32 bytes aleatorios.');
}

export const JWT_SECRET = process.env.JWT_SECRET;
