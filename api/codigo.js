// api/codigo.js — Vercel Serverless Function
// El cliente solo manda su correo @sharebot.net
// Las contraseñas están guardadas aquí (solo tú las ves)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { servicio, correo } = req.query;

  if (!servicio || !correo) {
    return res.status(400).json({ error: 'Faltan parámetros.' });
  }

  const serviciosValidos = ['netflix_hogar', 'netflix_login', 'disney'];
  if (!serviciosValidos.includes(servicio)) {
    return res.status(400).json({ error: 'Servicio no reconocido.' });
  }

  const correoNorm = correo.toLowerCase().trim();

  if (!correoNorm.endsWith('@sharebot.net')) {
    return res.status(400).json({ error: 'Solo se aceptan correos @sharebot.net.' });
  }

  // ══════════════════════════════════════════════════════════════
  // AQUÍ GUARDAS TUS CORREOS Y CONTRASEÑAS
  // El cliente NUNCA ve esto — solo está en tu servidor Vercel
  //
  // Formato:
  //   'correo@sharebot.net': { pass: 'contraseña', servicio: 'netflix_hogar' | 'netflix_login' | 'disney' }
  //
  // IMPORTANTE: El campo "servicio" indica para qué plataforma
  // es ese correo. Si un correo sirve para dos cosas (hogar y login)
  // ponlo dos veces con distinto servicio o usa 'netflix' para ambos.
  // ══════════════════════════════════════════════════════════════
  const CUENTAS = {
    // ── NETFLIX ──────────────────────────────────────────────
    'sadsad@sharebot.net': { pass: 'CUENTAS', servicio: 'netflix' },
    'disneyaccount23@sharebot.net': { pass: 'dasd', servicio: 'netflix' },
    '41414143@sharebot.net': { pass: 'CONTRASEÑA_3', servicio: 'netflix' },
    '41414144@sharebot.net': { pass: 'CONTRASEÑA_4', servicio: 'netflix' },
    '41414145@sharebot.net': { pass: 'CONTRASEÑA_5', servicio: 'netflix' },

    // ── DISNEY+ ───────────────────────────────────────────────
    '41414150@sharebot.net': { pass: 'CONTRASEÑA_6',  servicio: 'disney' },
    '41414151@sharebot.net': { pass: 'CONTRASEÑA_7',  servicio: 'disney' },
    '41414152@sharebot.net': { pass: 'CONTRASEÑA_8',  servicio: 'disney' },
    '41414153@sharebot.net': { pass: 'CONTRASEÑA_9',  servicio: 'disney' },
    '41414154@sharebot.net': { pass: 'CONTRASEÑA_10', servicio: 'disney' },

    // Agrega todos los que necesites con el mismo formato...
  };

  // Buscar el correo en la lista
  const cuenta = CUENTAS[correoNorm];
  if (!cuenta) {
    return res.status(403).json({ error: 'Correo no registrado. Verifica que sea el correo correcto.' });
  }

  // Verificar que el correo es del servicio correcto
  // 'netflix' acepta tanto netflix_hogar como netflix_login
  const servicioOk =
    cuenta.servicio === servicio ||
    (cuenta.servicio === 'netflix' && (servicio === 'netflix_hogar' || servicio === 'netflix_login'));

  if (!servicioOk) {
    return res.status(403).json({
      error: `Este correo no corresponde al servicio seleccionado. Verifica el servicio.`
    });
  }

  const MAILTM_API = 'https://api.mail.tm';

  try {
    // ── PASO 1: Autenticarse en mail.tm con las credenciales internas ──
    const loginRes = await fetch(`${MAILTM_API}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: correoNorm, password: cuenta.pass })
    });

    if (!loginRes.ok) {
      if (loginRes.status === 401) {
        return res.status(500).json({ error: 'Error de configuración interna. Contacta al soporte.' });
      }
      return res.status(500).json({ error: 'No se pudo conectar con el servidor de correo. Intenta de nuevo.' });
    }

    const { token } = await loginRes.json();

    // ── PASO 2: Leer los mensajes más recientes ──
    const msgsRes = await fetch(`${MAILTM_API}/messages?page=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!msgsRes.ok) {
      return res.status(500).json({ error: 'Error al leer la bandeja. Intenta de nuevo.' });
    }

    const msgsData = await msgsRes.json();
    const messages = msgsData['hydra:member'] || [];

    if (messages.length === 0) {
      return res.status(404).json({
        error: 'La bandeja está vacía. Solicita el código en la app primero y vuelve a intentar.'
      });
    }

    // ── PASO 3: Tomar el mensaje más reciente (primero de la lista) ──
    // mail.tm devuelve los mensajes ordenados del más reciente al más antiguo
    const sorted = [...messages].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const msgReciente = sorted[0];

    // ── PASO 4: Leer el contenido completo ──
    const msgRes = await fetch(`${MAILTM_API}/messages/${msgReciente.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!msgRes.ok) {
      return res.status(500).json({ error: 'Error al leer el mensaje. Intenta de nuevo.' });
    }

    const msg = await msgRes.json();

    // Combinar texto plano y HTML para buscar el código
    const textoPlano = msg.text || '';
    const textoHtml  = Array.isArray(msg.html) ? msg.html.join(' ') : (msg.html || '');
    const textoTotal = textoPlano + ' ' + textoHtml;

    // ── PASO 5: Extraer el código o link según el servicio ──
    let valor = null;

    if (servicio === 'netflix_hogar') {
      // Netflix Hogar: buscar el link de actualización de ubicación
      const patrones = [
        /https:\/\/www\.netflix\.com\/account\/travel\/[^\s"'<>\)\\]+/gi,
        /https:\/\/www\.netflix\.com\/[^\s"'<>\)\\]*travel[^\s"'<>\)\\]+/gi,
        /https:\/\/www\.netflix\.com\/account\/[^\s"'<>\)\\]{30,}/gi,
        /https:\/\/www\.netflix\.com\/[^\s"'<>\)\\]{40,}/gi,
      ];
      for (const p of patrones) {
        const m = textoTotal.match(p);
        if (m && m[0]) {
          valor = m[0].replace(/['">\s\\]+$/, '').trim();
          break;
        }
      }

    } else if (servicio === 'netflix_login') {
      // Netflix Login: código de 4 o 6 dígitos
      const patrones = [
        /c[oó]digo[^0-9]*([0-9]{4,6})/i,
        /code[^0-9]*([0-9]{4,6})/i,
        /verificaci[oó]n[^0-9]*([0-9]{4,6})/i,
        /verification[^0-9]*([0-9]{4,6})/i,
        />\s*([0-9]{4,6})\s*</,          // número entre tags HTML
        /\b([0-9]{6})\b/,                // 6 dígitos solos
        /\b([0-9]{4})\b/,                // 4 dígitos solos
      ];
      for (const p of patrones) {
        const m = textoTotal.match(p);
        if (m) { valor = m[1]; break; }
      }

    } else if (servicio === 'disney') {
      // Disney+: código de 6 dígitos
      const patrones = [
        /c[oó]digo[^0-9]*([0-9]{6})/i,
        /code[^0-9]*([0-9]{6})/i,
        /verificaci[oó]n[^0-9]*([0-9]{6})/i,
        /verification[^0-9]*([0-9]{6})/i,
        />\s*([0-9]{6})\s*</,
        /\b([0-9]{6})\b/,
      ];
      for (const p of patrones) {
        const m = textoTotal.match(p);
        if (m) { valor = m[1]; break; }
      }
    }

    if (!valor) {
      return res.status(404).json({
        error: `No se encontró el código en el último email (asunto: "${msgReciente.subject || 'sin asunto'}"). Solicita el código en la app y vuelve a intentar en unos segundos.`
      });
    }

    // ── PASO 6: Marcar como leído en segundo plano ──
    fetch(`${MAILTM_API}/messages/${msgReciente.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/merge-patch+json'
      },
      body: JSON.stringify({ seen: true })
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      valor,
      asunto: msgReciente.subject || '',
      fecha:  msgReciente.createdAt || ''
    });

  } catch (err) {
    console.error('[ERROR api/codigo]', err);
    return res.status(500).json({ error: 'Error interno. Intenta de nuevo en unos segundos.' });
  }
}
