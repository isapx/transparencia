import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { authenticateToken, requireRole } from './authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Carpeta pública de descargas
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
app.use('/uploads', express.static(uploadPath));

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

function removeUploadedFile(file) {
  if (!file) return;
  fs.unlink(file.path, error => {
    if (error && error.code !== 'ENOENT') {
      console.error('Error al limpiar archivo cargado:', error.message);
    }
  });
}

function isValidDocumentUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const parsedUrl = new URL(value);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

// ==========================================
// AUTENTICACIÓN
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body;
  if (!username || !fullName || !email || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Completa todos los campos y usa una contraseña de al menos 8 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await connection.beginTransaction();
    const [existingUsers] = await connection.query('SELECT id FROM users FOR UPDATE');
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(403).json({ error: 'El registro inicial ya fue realizado.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await connection.query(
      'INSERT INTO users (username, full_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [username, fullName, email, hash, 'admin']
    );
    await connection.commit();
    res.json({ message: 'Usuario registrado', userId: result.insertId });
  } catch (e) {
    if (connection) await connection.rollback();
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El usuario o correo electrónico ya está registrado.' });
    }
    console.error('Error al registrar usuario:', e.message);
    res.status(500).json({ error: 'Error al registrar el usuario inicial.' });
  } finally {
    connection?.release();
  }
});

app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, email, role, created_at FROM users ORDER BY username'
    );
    res.json(rows);
  } catch (e) {
    console.error('Error al listar usuarios:', e.message);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password, role } = req.body;

  if (!username || !fullName || !email || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Completa todos los campos y usa una contraseña de al menos 8 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }
  if (!['admin', 'usuario'].includes(role)) {
    return res.status(400).json({ error: 'Selecciona un perfil válido.' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, full_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [username, fullName, email, hash, role]
    );
    res.status(201).json({
      id: result.insertId,
      username,
      full_name: fullName,
      email,
      role,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El nombre de usuario o correo electrónico ya está registrado.' });
    }
    console.error('Error al crear usuario:', e.message);
    res.status(500).json({ error: 'Error al crear el usuario.' });
  }
});

app.put('/api/users/me', authenticateToken, async (req, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password, currentPassword } = req.body;

  if (!fullName || !email) {
    return res.status(400).json({ error: 'El nombre y el correo electrónico son obligatorios.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres.' });
  }
  if (password && (!currentPassword || typeof currentPassword !== 'string')) {
    return res.status(400).json({ error: 'Ingresa tu contraseña actual para cambiarla.' });
  }

  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (password) {
      const matches = await bcrypt.compare(currentPassword, rows[0].password);
      if (!matches) return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }

    const fields = ['full_name = ?', 'email = ?'];
    const values = [fullName, email];
    if (password) {
      fields.push('password = ?');
      values.push(await bcrypt.hash(password, 10));
    }
    values.push(req.user.id);

    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ id: req.user.id, username: req.user.username, fullName, email, role: req.user.role });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
    }
    console.error('Error al actualizar perfil:', e.message);
    res.status(500).json({ error: 'Error al actualizar tu perfil.' });
  }
});

app.put('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body.password;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const [result] = await pool.query(
      'UPDATE users SET email = ?, password = COALESCE(?, password) WHERE id = ?',
      [email, passwordHash, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const [rows] = await pool.query(
      'SELECT id, username, full_name, email, role, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
    }
    console.error('Error al actualizar usuario:', e.message);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, email, password, role FROM users WHERE username = ?',
      [username]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
    const match = await bcrypt.compare(password, rows[0].password);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });
    
    const { id, role, full_name: fullName, email } = rows[0];
    const token = jwt.sign({ id, username: rows[0].username }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({
      token,
      user: { id, username: rows[0].username, fullName, email, role }
    });
  } catch (e) {
    console.error('Error en login:', e.message);
    res.status(500).json({ error: 'Error interno en el servidor' });
  }
});

// ==========================================
// AÑOS
// ==========================================
app.get('/api/years', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM years ORDER BY year DESC');
    res.json(rows);
  } catch (e) {
    console.error('Error al listar años:', e.message);
    res.status(500).json({ error: 'Error al obtener años' });
  }
});

app.post('/api/years', authenticateToken, async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'El año es requerido' });

    const [result] = await pool.query('INSERT INTO years (year) VALUES (?)', [year]);
    res.json({ id: result.insertId, year });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `El año ${req.body.year} ya está registrado.` });
    }
    console.error('Error al crear año:', e.message);
    res.status(500).json({ error: 'Error al registrar el año' });
  }
});

// ==========================================
// ARTÍCULOS
// ==========================================
app.get('/api/articles/:yearId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM articles WHERE year_id = ?', [req.params.yearId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener artículos' });
  }
});

app.post('/api/articles', authenticateToken, async (req, res) => {
  try {
    const { yearId, number, name } = req.body;
    if (!yearId || !number) return res.status(400).json({ error: 'Faltan campos requeridos' });

    const [result] = await pool.query(
      'INSERT INTO articles (year_id, number, name) VALUES (?, ?, ?)',
      [yearId, number, name || '']
    );
    res.json({ id: result.insertId, yearId, number, name });
  } catch (e) {
    console.error('Error al crear artículo:', e.message);
    res.status(500).json({ error: 'Error al registrar el artículo' });
  }
});

// ==========================================
// FRACCIONES
// ==========================================
app.get('/api/fractions/:articleId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fractions WHERE article_id = ?', [req.params.articleId]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener fracciones' });
  }
});

app.post('/api/fractions', authenticateToken, async (req, res) => {
  try {
    const { articleId, code, name } = req.body;
    if (!articleId || !code) return res.status(400).json({ error: 'Faltan campos requeridos' });

    const [result] = await pool.query(
      'INSERT INTO fractions (article_id, code, name) VALUES (?, ?, ?)',
      [articleId, code, name || '']
    );
    res.json({ id: result.insertId, articleId, code, name });
  } catch (e) {
    console.error('Error al crear fracción:', e.message);
    res.status(500).json({ error: 'Error al registrar la fracción' });
  }
});

// ==========================================
// DOCUMENTOS
// ==========================================
app.get('/api/documents/:fractionId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM documents WHERE fraction_id = ?', [req.params.fractionId]);
    res.json(rows);
  } catch (e) {
    console.error('Error al listar documentos:', e.message);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
});

app.post('/api/documents', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { fractionId, title, period } = req.body;
    const url = typeof req.body.url === 'string' ? req.body.url.trim() : '';
    let filePath;

    if (!/^\d+$/.test(fractionId || '') || !title?.trim() || !period?.trim()) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: 'La fracción, el título y el periodo son obligatorios.' });
    }

    if (req.file && url) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: 'Selecciona un archivo o una URL, no ambos.' });
    }

    if (req.file) {
      filePath = `/uploads/${req.file.filename}`;
    } else if (url) {
      if (!isValidDocumentUrl(url)) {
        return res.status(400).json({ error: 'Ingresa una URL válida que comience con http:// o https://.' });
      }
      filePath = url;
    } else {
      return res.status(400).json({ error: 'Debes subir un archivo o ingresar una URL.' });
    }

    const [result] = await pool.query(
      'INSERT INTO documents (fraction_id, title, period, file_path) VALUES (?, ?, ?, ?)',
      [fractionId, title.trim(), period.trim(), filePath]
    );

    res.json({
      id: result.insertId,
      fractionId,
      title: title.trim(),
      period: period.trim(),
      file_path: filePath,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    removeUploadedFile(req.file);
    console.error('Error al subir documento:', e.message);
    res.status(500).json({ error: 'Error al registrar el documento' });
  }
});

app.put('/api/documents/:id', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const period = typeof req.body.period === 'string' ? req.body.period.trim() : '';
    const sourceType = req.body.sourceType;
    const url = typeof req.body.url === 'string' ? req.body.url.trim() : '';
    if (!title || !period || !['file', 'url'].includes(sourceType)) {
      removeUploadedFile(req.file);
      return res.status(400).json({ error: 'Completa el título, el periodo y el tipo de documento.' });
    }

    const [rows] = await pool.query('SELECT file_path FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      removeUploadedFile(req.file);
      return res.status(404).json({ error: 'El documento no existe.' });
    }

    const previousPath = rows[0].file_path;
    let filePath;
    if (sourceType === 'url') {
      if (req.file || !isValidDocumentUrl(url)) {
        removeUploadedFile(req.file);
        return res.status(400).json({ error: 'Ingresa una URL válida que comience con http:// o https://.' });
      }
      filePath = url;
    } else if (req.file) {
      filePath = `/uploads/${req.file.filename}`;
    } else if (/^https?:\/\//i.test(previousPath)) {
      return res.status(400).json({ error: 'Selecciona el archivo que quieres asociar al documento.' });
    } else {
      filePath = previousPath;
    }

    await pool.query(
      'UPDATE documents SET title = ?, period = ?, file_path = ? WHERE id = ?',
      [title, period, filePath, req.params.id]
    );

    if (filePath !== previousPath && previousPath.startsWith('/uploads/')) {
      const oldFile = path.join(uploadPath, path.basename(previousPath));
      if (fs.existsSync(oldFile)) removeUploadedFile({ path: oldFile });
    }

    res.json({
      id: Number(req.params.id),
      title,
      period,
      file_path: filePath
    });
  } catch (e) {
    removeUploadedFile(req.file);
    console.error('Error al actualizar documento:', e.message);
    res.status(500).json({ error: 'Error al actualizar el documento.' });
  }
});

app.delete('/api/documents/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT file_path FROM documents WHERE id = ?', [req.params.id]);
    if (rows.length > 0 && rows[0].file_path && !/^https?:\/\//i.test(rows[0].file_path)) {
      const full = path.join(__dirname, rows[0].file_path);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
    await pool.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Error al eliminar documento:', e.message);
    res.status(500).json({ error: 'Error al eliminar el documento' });
  }
});

// ==========================================
// EDICIÓN Y ELIMINACIÓN DE AÑOS
// ==========================================
app.put('/api/years/:id', authenticateToken, async (req, res) => {
  try {
    const { year } = req.body;
    await pool.query('UPDATE years SET year = ? WHERE id = ?', [year, req.params.id]);
    res.json({ id: parseInt(req.params.id), year });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `El año ${req.body.year} ya existe.` });
    }
    res.status(500).json({ error: 'Error al actualizar año' });
  }
});

app.delete('/api/years/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    // Opcional: borrar archivos físicos antes de eliminar en cascada
    await pool.query('DELETE FROM years WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar año' });
  }
});

// ==========================================
// EDICIÓN Y ELIMINACIÓN DE ARTÍCULOS
// ==========================================
app.put('/api/articles/:id', authenticateToken, async (req, res) => {
  try {
    const { number, name } = req.body;
    await pool.query(
      'UPDATE articles SET number = ?, name = ? WHERE id = ?',
      [number, name, req.params.id]
    );
    res.json({ id: parseInt(req.params.id), number, name });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar artículo' });
  }
});

app.delete('/api/articles/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM articles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar artículo' });
  }
});

// ==========================================
// EDICIÓN Y ELIMINACIÓN DE FRACCIONES
// ==========================================
app.put('/api/fractions/:id', authenticateToken, async (req, res) => {
  try {
    const { code, name } = req.body;
    await pool.query(
      'UPDATE fractions SET code = ?, name = ? WHERE id = ?',
      [code, name, req.params.id]
    );
    res.json({ id: parseInt(req.params.id), code, name });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar fracción' });
  }
});

app.delete('/api/fractions/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM fractions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar fracción' });
  }
});

async function ensureUserProfileSchema() {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('full_name', 'email')`
  );
  const existingColumns = new Set(columns.map(column => column.COLUMN_NAME));
  if (!existingColumns.has('full_name')) {
    await pool.query('ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NULL');
  }
  if (!existingColumns.has('email')) {
    await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL');
  }

  const [indexes] = await pool.query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'email'
       AND NON_UNIQUE = 0`
  );
  if (indexes.length === 0) {
    await pool.query('CREATE UNIQUE INDEX users_email_unique ON users (email)');
  }
}

const PORT = process.env.PORT || 4000;
ensureUserProfileSchema()
  .then(() => app.listen(PORT, () => console.log(`API lista en http://localhost:${PORT}`)))
  .catch(async error => {
    console.error('Error al preparar la base de datos de usuarios:', error.message);
    await pool.end();
    process.exitCode = 1;
  });