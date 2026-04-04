// api/codigo.js — Vercel Serverless Function v2.1
// El cliente solo manda su correo — las contraseñas solo las ves tú

module.exports = async (req, res) => {
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

  if (!correoNorm.includes('@')) {
    return res.status(400).json({ error: 'Correo inválido.' });
  }

  // ═══════════════════════════════════════════════════════════
  // TUS CORREOS Y CONTRASEÑAS — el cliente NUNCA ve esto
  // Pon aquí todos tus correos con sus contraseñas reales
  // ═══════════════════════════════════════════════════════════
  const CUENTAS = {
    // ── NETFLIX ─────────────────────────────────────────────
    'disneyaccount23@sharebot.net':          { pass: 'dasd', servicio: 'netflix' },
    'disneyaccount23@sharebot.net': { pass: 'dasd',    servicio: 'netflix' },
    // Agrega más correos así:
    // 'micorreo@sharebot.net': { pass: 'miContraseña', servicio: 'netflix' },

    // ── DISNEY+ ─────────────────────────────────────────────
    // 'correoDisney@sharebot.net': { pass: 'contraseña', servicio: 'disney' },
  };

  const cuenta = CUENTAS[correoNorm];
  if (!cuenta) {
    return res.status(403).json({
      error: 'Correo no registrado. Verifica que sea exactamente el correo que te proporcionamos.'
    });
  }

  // Verificar que el correo corresponde al servicio seleccionado
  const servicioOk =
    cuenta.servicio === servicio ||
    (cuenta.servicio === 'netflix' && (servicio === 'netflix_hogar' || servicio === 'netflix_login'));

  if (!servicioOk) {
    return res.status(403).json({
      error: 'Este correo no corresponde al servicio seleccionado.'
    });
  }

  const MAILTM = 'https://api.mail.tm';

  try {
    // ── PASO 1: Login en mail.tm ─────────────────────────────
    console.log(`[LOGIN] Intentando para: ${correoNorm}`);

    let loginRes;
    try {
      loginRes = await fetch(`${MAILTM}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: correoNorm, password: cuenta.pass })
      });
    } catch (err) {
      console.error('[ERROR FETCH LOGIN]', err.message);
      return res.status(502).json({
        error: `Sin conexión con mail.tm: ${err.message}. Intenta de nuevo.`
      });
    }

    const rawText = await loginRes.text();
    let loginBody = {};
    try { loginBody = JSON.parse(rawText); } catch { loginBody = { raw: rawText }; }

    console.log(`[LOGIN STATUS] ${loginRes.status} — ${rawText.substring(0, 200)}`);

    if (!loginRes.ok) {
      if (loginRes.status === 401) {
        return res.status(500).json({
          error: 'Error de configuración. Contacta al soporte (código: auth-fail).'
        });
      }
      if (loginRes.status === 404) {
        return res.status(500).json({
          error: 'La cuenta de correo no existe en mail.tm. Contacta al soporte (código: no-account).'
        });
      }
      if (loginRes.status === 429) {
        return res.status(429).json({
          error: 'Demasiados intentos. Espera 1 minuto y vuelve a intentar.'
        });
      }
      return res.status(500).json({
        error: `Error del servidor de correo (${loginRes.status}). Intenta de nuevo en unos segundos.`
      });
    }

    const { token } = loginBody;
    if (!token) {
      return res.status(500).json({ error: 'No se obtuvo token. Intenta de nuevo.' });
    }

    // ── PASO 2: Obtener mensajes ─────────────────────────────
    const msgsRes = await fetch(`${MAILTM}/messages?page=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!msgsRes.ok) {
      return res.status(500).json({
        error: `Error al leer bandeja (${msgsRes.status}). Intenta de nuevo.`
      });
    }

    const msgsData = await msgsRes.json();
    const messages = msgsData['hydra:member'] || [];

    console.log(`[MENSAJES] Encontrados: ${messages.length}`);

    if (messages.length === 0) {
      return res.status(404).json({
        error: 'La bandeja está vacía. Solicita el código en la app de Netflix o Disney+ primero.'
      });
    }

    // El más reciente primero
    const sorted = [...messages].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const ultimo = sorted[0];
    console.log(`[ULTIMO MSG] Asunto: "${ultimo.subject}" | De: ${ultimo.from?.address}`);

    // ── PASO 3: Leer el mensaje completo ────────────────────
    const msgRes = await fetch(`${MAILTM}/messages/${ultimo.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!msgRes.ok) {
      return res.status(500).json({ error: `Error al leer mensaje (${msgRes.status}).` });
    }

    const msg = await msgRes.json();

    const textoPlano = msg.text || '';
    const textoHtml  = Array.isArray(msg.html) ? msg.html.join(' ') : (msg.html || '');
    const textoTotal = textoPlano + ' ' + textoHtml;

    console.log(`[TEXTO PLANO] ${textoPlano.substring(0, 400)}`);

    // ── PASO 4: Extraer código o link ────────────────────────
    let valor = null;

    if (servicio === 'netflix_hogar') {
      // Buscar link de actualización de hogar Netflix
      const patrones = [
        /https:\/\/www\.netflix\.com\/account\/travel\/[^\s"'<>\)\\]+/gi,
        /https:\/\/www\.netflix\.com\/[^\s"'<>\)\\]*travel[^\s"'<>\)\\]+/gi,
        /https:\/\/www\.netflix\.com\/account\/[^\s"'<>\)\\]{30,}/gi,
        /https:\/\/www\.netflix\.com\/[^\s"'<>\)\\]{40,}/gi,
      ];
      for (const p of patrones) {
        const m = textoTotal.match(p);
        if (m?.[0]) { valor = m[0].replace(/['">\s\\]+$/, '').trim(); break; }
      }

    } else if (servicio === 'netflix_login') {
      // Código 4 o 6 dígitos de Netflix
      const patrones = [
        /c[oó]digo[^0-9]*([0-9]{4,6})/i,
        /code[^0-9]*([0-9]{4,6})/i,
        /verificaci[oó]n[^0-9]*([0-9]{4,6})/i,
        /verification[^0-9]*([0-9]{4,6})/i,
        />\s*([0-9]{4,6})\s*</,
        /\b([0-9]{6})\b/,
        /\b([0-9]{4})\b/,
      ];
      for (const p of patrones) {
        const m = textoTotal.match(p);
        if (m) { valor = m[1]; break; }
      }

    } else if (servicio === 'disney') {
      // Código 6 dígitos de Disney+
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
      console.log('[NO CODIGO] Texto completo:', textoPlano.substring(0, 600));
      return res.status(404).json({
        error: `No se encontró el código en el último email ("${ultimo.subject || 'sin asunto'}"). Solicita el código nuevamente en la app.`
      });
    }

    console.log(`[OK] Valor extraído: ${valor.substring(0, 80)}`);

    // Marcar como leído (no bloqueante)
    fetch(`${MAILTM}/messages/${ultimo.id}`, {
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
      asunto: ultimo.subject || '',
      fecha:  ultimo.createdAt || ''
    });

  } catch (err) {
    console.error('[ERROR GENERAL]', err);
    return res.status(500).json({ error: `Error: ${err.message}` });
  }
};
