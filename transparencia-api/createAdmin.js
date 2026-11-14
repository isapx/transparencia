import bcrypt from 'bcrypt';
import { pool } from './db.js';

const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
const fullName = process.env.BOOTSTRAP_ADMIN_FULL_NAME?.trim();
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

async function createInitialAdmin() {
  if (!username || username.length > 100 || !fullName || fullName.length > 255
    || !email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof password !== 'string' || [...password].length < 12
    || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Configura los datos del administrador y una contraseña de 12 a 72 bytes.');
  }

  const [users] = await pool.query('SELECT id FROM users LIMIT 1');
  if (users.length > 0) {
    throw new Error('Ya existen usuarios; el administrador inicial solo puede crearse una vez.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO users (username, full_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
    [username, fullName, email, passwordHash, 'admin']
  );
  console.log('Administrador inicial creado.');
}

try {
  await createInitialAdmin();
} catch (error) {
  console.error('Error al crear el administrador inicial:', error.message);
  process.exitCode = 1;
} finally {
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  await pool.end();
}
