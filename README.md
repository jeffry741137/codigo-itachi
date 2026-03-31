# ⚔ ItachiZone v2.0 — Guía de instalación completa

## 📁 Estructura del proyecto

```
itachi-zone/
├── api/
│   └── codigo.js        ← Backend (Vercel Serverless Function)
├── public/
│   └── index.html       ← Frontend
├── vercel.json          ← Configuración de rutas
├── package.json
└── README.md
```

---

## 🚀 Instalación paso a paso

### PASO 1 — Subir a GitHub

1. Crea un repositorio nuevo en github.com (puede ser privado)
2. Sube todos los archivos manteniendo la estructura de carpetas:
   - `api/codigo.js`
   - `public/index.html`
   - `vercel.json`
   - `package.json`

### PASO 2 — Conectar con Vercel

1. Ve a [vercel.com](https://vercel.com) → Log in con tu GitHub
2. "Add New Project" → selecciona tu repositorio
3. En la configuración del proyecto:
   - **Framework Preset**: Other
   - **Root Directory**: `.` (dejar en raíz)
   - **Build Command**: (vacío, no necesita)
   - **Output Directory**: (vacío)
4. Click "Deploy"

### PASO 3 — ¡Listo!

Tu página estará en `https://tu-proyecto.vercel.app`

---

## 🔧 Cómo funciona

1. El cliente escribe su correo `@sharebot.net` y su contraseña de mail.tm
2. Tu API en Vercel se autentica en `api.mail.tm` con esas credenciales
3. Busca el email más reciente de Netflix o Disney+ en esa bandeja
4. Extrae el código (4 dígitos, 6 dígitos) o el link de hogar
5. Lo muestra en la página al cliente

**La contraseña NUNCA se almacena** — solo se usa en el momento para autenticarse en mail.tm y se descarta.

---

## 📧 Cómo crear correos en mail.tm

### Opción A: Desde la web
1. Ve a [mail.tm](https://mail.tm)
2. Clic en "Create account"
3. Escribe el nombre que quieras antes del @
4. Selecciona el dominio `@sharebot.net` (si no aparece, prueba con otro dominio de la lista)
5. Pon una contraseña y guárdala

### Opción B: Desde la API (para crear muchos a la vez)
```bash
# Crear cuenta
curl -X POST https://api.mail.tm/accounts \
  -H "Content-Type: application/json" \
  -d '{"address":"41414141@sharebot.net","password":"TuContraseña123"}'

# Verificar que funciona (obtener token)
curl -X POST https://api.mail.tm/token \
  -H "Content-Type: application/json" \
  -d '{"address":"41414141@sharebot.net","password":"TuContraseña123"}'
```

---

## ⚠️ Ajustar los patrones de extracción de código

Si el código no se detecta correctamente, necesitas ver el texto del email y ajustar
los patrones en `api/codigo.js`. Para ver qué contiene un email:

```bash
# 1. Obtén el token
TOKEN=$(curl -s -X POST https://api.mail.tm/token \
  -H "Content-Type: application/json" \
  -d '{"address":"TU@sharebot.net","password":"TUPASS"}' | jq -r .token)

# 2. Lista mensajes
curl -s https://api.mail.tm/messages \
  -H "Authorization: Bearer $TOKEN" | jq .

# 3. Lee un mensaje específico (reemplaza ID)
curl -s https://api.mail.tm/messages/ID_DEL_MENSAJE \
  -H "Authorization: Bearer $TOKEN" | jq '.text'
```

Comparte el texto que ves y te doy el regex exacto.

---

## 🔄 Actualizar el proyecto

Cada vez que hagas cambios y los subas a GitHub, Vercel hace el deploy automáticamente.

---

## 🛠️ Probar en local (opcional)

```bash
npm i -g vercel
vercel dev
# Abre http://localhost:3000
```
