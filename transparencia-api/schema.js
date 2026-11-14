export async function migrateSchema(pool) {
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

  const [roleColumns] = await pool.query(
    `SELECT COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role'`
  );
  if (roleColumns.length > 0 && roleColumns[0].COLUMN_DEFAULT !== 'usuario') {
    await pool.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'usuario'");
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

  const [documentColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'documents'
       AND COLUMN_NAME = 'created_by_id'`
  );
  if (documentColumns.length === 0) {
    await pool.query('ALTER TABLE documents ADD COLUMN created_by_id INT NULL');
  }
  const [documentIndexes] = await pool.query(
    `SELECT CONSTRAINT_NAME
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'documents'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
       AND CONSTRAINT_NAME = 'documents_created_by_fk'`
  );
  if (documentIndexes.length === 0) {
    await pool.query(
      'ALTER TABLE documents ADD CONSTRAINT documents_created_by_fk FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL'
    );
  }
}
