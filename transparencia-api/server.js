import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { authenticateToken } from './authMiddleware.js';

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

// ==========================================
// AUTENTICACIÓN
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
    res.json({ message: 'Usuario registrado', userId: result.insertId });
  } catch (e) {
    console.error('Error al registrar usuario:', e.message);
    res.status(400).json({ error: 'Error al registrar o el usuario ya existe' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
    const match = await bcrypt.compare(password, rows[0].password);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });
    
    const token = jwt.sign({ id: rows[0].id, username }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, username });
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
      return res.status(400).json({ error: 'La fracción, el título y el periodo son obligatorios.' });
    }

    if (req.file && url) {
      return res.status(400).json({ error: 'Selecciona un archivo o una URL, no ambos.' });
    }

    if (req.file) {
      filePath = `/uploads/${req.file.filename}`;
    } else if (url) {
      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol) || url.length > 500) {
          throw new Error('Invalid document URL');
        }
      } catch {
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
    console.error('Error al subir documento:', e.message);
    res.status(500).json({ error: 'Error al registrar el documento' });
  }
});

app.delete('/api/documents/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/years/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/articles/:id', authenticateToken, async (req, res) => {
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

app.delete('/api/fractions/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM fractions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar fracción' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API lista en http://localhost:${PORT}`));