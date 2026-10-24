import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { pool } from './db.js';
dotenv.config();

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, role FROM users WHERE id = ?',
      [payload.id]
    );
    if (rows.length === 0) return res.status(403).json({ error: 'La cuenta ya no está disponible' });

    req.user = rows[0];
    next();
  } catch (error) {
    console.error('Error al verificar el usuario:', error.message);
    res.status(500).json({ error: 'Error al verificar la sesión' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
    }
    next();
  };
}