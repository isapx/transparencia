import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(apiDirectory, '.env') });
dotenv.config();
