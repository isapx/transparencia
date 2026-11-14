import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { JWT_SECRET } from './securityConfig.js';
import { authenticateToken, requireRole } from './authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.avif',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz'
]);
const INLINE_UPLOAD_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.avif'
]);
const productionOrigins = ['https://transparencia.etchojoa.gob.mx'];
const developmentOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || (process.env.NODE_ENV === 'production'
    ? productionOrigins.join(',')
    : developmentOrigins.join(',')))
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);
const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS debe ser un entero no negativo.');
}

app.disable('x-powered-by');
app.set('trust proxy', trustedProxyHops);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  }
}));
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

// Carpeta pública de descargas
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
app.use('/uploads', express.static(uploadPath, {
  dotfiles: 'deny',
  index: false,
  setHeaders(res, filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (!INLINE_UPLOAD_EXTENSIONS.has(extension)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
}));

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1,
    fields: 4,
    fieldSize: 16 * 1024,
    parts: 5
  },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(path.extname(file.originalname).toLowerCase())) {
      const error = new Error('Tipo de archivo no permitido.');
      error.code = 'UNSUPPORTED_FILE_TYPE';
      return callback(error);
    }
    callback(null, true);
  }
});

function receiveDocumentUpload(req, res, next) {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El archivo supera el límite permitido de 100 MB.' });
      }
      return res.status(400).json({ error: 'No se pudo procesar el archivo enviado.' });
    }
    if (error.code === 'UNSUPPORTED_FILE_TYPE') {
      return res.status(415).json({
        error: 'Tipo de archivo no permitido. Usa PDF, DOC/DOCX, XLS/XLSX, imágenes raster o archivos comprimidos.'
      });
    }

    console.error('Error al recibir archivo:', error.message);
    return res.status(500).json({ error: 'No se pudo recibir el archivo.' });
  });
}

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

function isValidPassword(value) {
  return typeof value === 'string'
    && [...value].length >= 12
    && Buffer.byteLength(value, 'utf8') <= 72;
}

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' }
});
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Se alcanzó el límite temporal de solicitudes.' }
});

app.use('/api', apiRateLimit, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ==========================================
// AUTENTICACIÓN
// ==========================================
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

  if (!username || username.length > 100 || !fullName || fullName.length > 255
    || !email || email.length > 255 || !isValidPassword(password)) {
    return res.status(400).json({ error: 'Completa los campos y usa una contraseña de 12 a 72 bytes.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }
  if (!['admin', 'usuario'].includes(role)) {
    return res.status(400).json({ error: 'Selecciona un perfil válido.' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
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
  if (password !== undefined && !isValidPassword(password)) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 12 caracteres y no superar 72 bytes.' });
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
      values.push(await bcrypt.hash(password, 12));
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
  if (password !== undefined && !isValidPassword(password)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres y no superar 72 bytes.' });
  }

  try {
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
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

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || !username || username.length > 100
    || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, email, password, role FROM users WHERE username = ?',
      [username]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
    const match = await bcrypt.compare(password, rows[0].password);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });
    
    const { id, role, full_name: fullName, email } = rows[0];
    const token = jwt.sign({ id, username: rows[0].username }, JWT_SECRET, { expiresIn: '8h' });
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
    const [rows] = await pool.query(
      `SELECT documents.*, users.username AS created_by_username,
              COALESCE(users.full_name, users.username) AS created_by_name
       FROM documents
       LEFT JOIN users ON users.id = documents.created_by_id
       WHERE documents.fraction_id = ?
       ORDER BY documents.created_at DESC`,
      [req.params.fractionId]
    );
    res.json(rows);
  } catch (e) {
    console.error('Error al listar documentos:', e.message);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
});

app.post('/api/documents', authenticateToken, receiveDocumentUpload, async (req, res) => {
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
      'INSERT INTO documents (fraction_id, title, period, file_path, created_by_id) VALUES (?, ?, ?, ?, ?)',
      [fractionId, title.trim(), period.trim(), filePath, req.user.id]
    );

    res.json({
      id: result.insertId,
      fractionId,
      title: title.trim(),
      period: period.trim(),
      file_path: filePath,
      created_by_id: req.user.id,
      created_by_name: req.user.full_name || req.user.username,
      created_by_username: req.user.username,
      created_at: new Date().toISOString()
    });
  } catch (e) {
    removeUploadedFile(req.file);
    console.error('Error al subir documento:', e.message);
    res.status(500).json({ error: 'Error al registrar el documento' });
  }
});

app.put('/api/documents/:id', authenticateToken, receiveDocumentUpload, async (req, res) => {
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

app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  console.error('Error no controlado en la API:', error.message);
  res.status(status).json({
    error: status < 500 ? 'Solicitud inválida.' : 'Error interno del servidor.'
  });
});

function formatDocumentTimestamp(value) {
  if (!value) return 'Fecha no registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no registrada';
  return date.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

const PORT = Number(process.env.PORT || 4000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT debe ser un puerto válido.');
}
const HOST = process.env.HOST || '127.0.0.1';
server.headersTimeout = 65 * 1000;
server.requestTimeout = 10 * 60 * 1000;
server.listen(PORT, HOST, () => console.log(`API lista en ${HOST}:${PORT}`));