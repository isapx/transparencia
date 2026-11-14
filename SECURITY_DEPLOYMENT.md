# Despliegue seguro

## Requisitos

- Usa Node.js 22 LTS o posterior.
- Sirve el frontend y la API bajo `https://transparencia.etchojoa.gob.mx`.
- Termina TLS en un proxy inverso y deja Node escuchando solo en `127.0.0.1:4000`.
- Expón únicamente los puertos 80/443 y SSH restringido; no expongas MySQL al público.
- Configura el proxy para reemplazar `X-Forwarded-For` y `X-Forwarded-Proto`. Usa `TRUST_PROXY_HOPS=1` solo con un proxy confiable delante de Node.

El proxy debe servir `transparencia-client/dist` y enviar `/api` y `/uploads` a `127.0.0.1:4000`. Configura también en el proxy los límites y tiempos de espera necesarios para cargas de hasta 100 MB. Para el frontend, aplica `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` y una CSP con `frame-ancestors 'self'`; activa HSTS solo después de comprobar HTTPS.

## Variables de entorno

Usa [transparencia-api/.env.example](./transparencia-api/.env.example) como referencia. En producción configura `NODE_ENV=production`, `HOST=127.0.0.1`, `CORS_ORIGINS=https://transparencia.etchojoa.gob.mx`, `TRUST_PROXY_HOPS=1` y los datos de MySQL.

Genera un `JWT_SECRET` aleatorio de al menos 32 bytes con un gestor de secretos o `openssl rand -base64 48`. No uses el valor de ejemplo ni lo guardes en Git.

## Base de datos y administrador inicial

1. Crea la base con [init.sql](./init.sql) en una instancia nueva. Para una base existente, ejecuta `npm run db:migrate` desde `transparencia-api` durante el despliegue.
2. Usa un usuario de MySQL con permisos de migración solo para ese paso. No dejes sus credenciales en el entorno permanente del proceso.
3. Configura para la API un usuario distinto con solo `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre las tablas de la aplicación.
4. Crea el primer administrador desde una terminal privada; no existe registro público:

   ```sh
   read -r -p "Usuario: " BOOTSTRAP_ADMIN_USERNAME
   read -r -p "Nombre: " BOOTSTRAP_ADMIN_FULL_NAME
   read -r -p "Correo: " BOOTSTRAP_ADMIN_EMAIL
   read -r -s -p "Contraseña (12 caracteres mínimo): " BOOTSTRAP_ADMIN_PASSWORD
   printf '\n'
   export BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_FULL_NAME BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
   npm run create-admin
   unset BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_FULL_NAME BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
   ```

El comando solo crea un administrador si la tabla `users` está vacía. Las contraseñas nuevas deben tener al menos 12 caracteres y no más de 72 bytes. Las contraseñas existentes siguen funcionando; cámbialas desde el perfil tras iniciar sesión.

## Límites operativos

- El límite general es de 300 solicitudes por IP cada 15 minutos y el inicio de sesión permite 10 intentos en ese periodo. Usa memoria local: ejecuta un solo proceso de Node; si activas varios workers o réplicas, configura un almacén compartido para los límites.
- Las cargas se limitan a 100 MB y a PDF, DOC/DOCX, XLS/XLSX, imágenes raster y archivos comprimidos. SVG y HTML no están permitidos; los archivos que no sean PDF o imagen raster se fuerzan a descarga.
- Supervisa el espacio de `transparencia-api/uploads` y respalda tanto archivos como base de datos. El límite por archivo no sustituye una cuota de almacenamiento ni un análisis antimalware.
- Restringe los permisos del sistema de archivos: el proceso solo necesita escribir en `transparencia-api/uploads` y leer el resto de la aplicación.

## Rotación de credenciales

Una versión anterior del repositorio contenía una contraseña de base de datos fija. Si esa credencial se llegó a usar, cámbiala en MySQL y en el entorno de despliegue; trata cualquier credencial histórica del repositorio como comprometida. El archivo `.env` debe permanecer fuera de Git.
