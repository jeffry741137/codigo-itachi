// api/codigo.js — Vercel Serverless Function
// Lee la bandeja de mail.tm del cliente y extrae el último código/link

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { servicio, correo } = req.query;

  // ── Validaciones básicas ──────────────────────────────────
  if (!servicio || !correo) {
    return res.status(400).json({ error: 'Faltan parámetros: servicio y correo son requeridos.' });
  }

  const serviciosValidos = ['netflix_hogar', 'netflix_login', 'disney'];
  if (!serviciosValidos.includes(servicio)) {
    return res.status(400).json({ error: 'Servicio no reconocido.' });
  }

  const correoNorm = correo.toLowerCase().trim();

  // Validar que sea un correo @sharebot.net
  if (!correoNorm.endsWith('@sharebot.net')) {
    return res.status(400).json({ error: 'Solo se aceptan correos @sharebot.net.' });
  }

  // ── La contraseña viene como parámetro del request ────────
  // El frontend la pide al usuario y la manda aquí
  const { password } = req.query;
  if (!password) {
    return res.status(400).json({ error: 'Se requiere la contraseña del correo.' });
  }

  const MAILTM_API = 'https://api.mail.tm';

  try {
    // ── PASO 1: Autenticarse en mail.tm ──────────────────────
    const loginRes = await fetch(`${MAILTM_API}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: correoNorm, password })
    });

    if (!loginRes.ok) {
      const err = await loginRes.json().catch(() => ({}));
      if (loginRes.status === 401) {
        return res.status(401).json({ error: 'Correo o contraseña incorrectos. Verifica tus datos.' });
      }
      return res.status(500).json({ error: 'No se pudo conectar con el servidor de correo.' });
    }

    const { token } = await loginRes.json();

    // ── PASO 2: Obtener mensajes (última página = más recientes) ──
    const msgsRes = await fetch(`${MAILTM_API}/messages?page=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!msgsRes.ok) {
      return res.status(500).json({ error: 'Error al leer la bandeja de entrada.' });
    }

    const msgsData = await msgsRes.json();
    const messages = msgsData['hydra:member'] || [];

    if (messages.length === 0) {
      return res.status(404).json({
        error: 'La bandeja está vacía. Solicita el código en la app de Netflix o Disney+ primero.'
      });
    }

    // ── PASO 3: Filtrar mensajes relevantes según el servicio ──
    // Remitentes conocidos de Netflix y Disney
    const REMITENTES = {
      netflix_hogar: ['info@mailer.netflix.com', 'netflix@mailer.netflix.com', 'mailer@netflix.com', 'netflix'],
      netflix_login: ['info@mailer.netflix.com', 'netflix@mailer.netflix.com', 'mailer@netflix.com', 'netflix'],
      disney: ['disneyplus@mail.disneyplus.com', 'no-reply@disneyplus.com', 'disney']
    };

    // Ordenar por fecha descendente (más reciente primero)
    const sorted = [...messages].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Buscar el mensaje más reciente del servicio seleccionado
    const remitentesServicio = REMITENTES[servicio];
    let mensajeRelevante = null;

    for (const msg of sorted) {
      const from = (msg.from?.address || msg.from?.name || '').toLowerCase();
      const subject = (msg.subject || '').toLowerCase();

      const esRelevante = remitentesServicio.some(r => from.includes(r) || subject.includes(r.split('@')[0]));
      if (esRelevante) {
        mensajeRelevante = msg;
        break;
      }
    }

    // Si no encontramos uno filtrado, usar el más reciente de todos
    if (!mensajeRelevante) {
      mensajeRelevante = sorted[0];
    }

    // ── PASO 4: Leer el contenido completo del mensaje ────────
    const msgRes = await fetch(`${MAILTM_API}/messages/${mensajeRelevante.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!msgRes.ok) {
      return res.status(500).json({ error: 'Error al leer el contenido del mensaje.' });
    }

    const msgCompleto = await msgRes.json();

    // Extraer texto plano y HTML
    const textoPlano = msgCompleto.text || '';
    const textoHtml  = msgCompleto.html?.[0] || msgCompleto.html || '';
    const textoTotal = textoPlano + ' ' + textoHtml;

    // ── PASO 5: Extraer código o link según el servicio ───────
    let valor = null;
    let tipo  = null;

    if (servicio === 'netflix_hogar') {
      // Netflix Hogar: buscar link de actualización de ubicación
      // Formatos conocidos de Netflix:
      const patrones = [
        /https:\/\/www\.netflix\.com\/account\/travel\/[^\s"'<>\)]+/gi,
        /https:\/\/www\.netflix\.com\/[^\s"'<>\)]*travel[^\s"'<>\)]+/gi,
        /https:\/\/www\.netflix\.com\/account\/[^\s"'<>\)]+verify[^\s"'<>\)]+/gi,
        /https:\/\/www\.netflix\.com\/[^\s"'<>\)]+hogar[^\s"'<>\)]+/gi,
        /https:\/\/www\.netflix\.com\/[^\s"'<>\)]+home[^\s"'<>\)]+/gi,
      ];

      for (const patron of patrones) {
        const match = textoTotal.match(patron);
        if (match && match[0]) {
          valor = match[0].replace(/['">\s]+$/, '').trim();
          tipo  = 'link';
          break;
        }
      }

      // Fallback: cualquier link largo de netflix.com
      if (!valor) {
        const fallback = textoTotal.match(/https:\/\/www\.netflix\.com\/[^\s"'<>\)]{20,}/gi);
        if (fallback) {
          valor = fallback[0].replace(/['">\s]+$/, '').trim();
          tipo  = 'link';
        }
      }

    } else if (servicio === 'netflix_login') {
      // Netflix Login: código de 4 o 6 dígitos
      // Netflix suele enviar "Tu código es XXXX" o el número solo en grande
      const patrones4 = [
        /c[oó]digo[^\d]*(\d{4})\b/i,
        /code[^\d]*(\d{4})\b/i,
        /\b(\d{4})\b(?!\d)/,
      ];
      const patrones6 = [
        /c[oó]digo[^\d]*(\d{6})\b/i,
        /code[^\d]*(\d{6})\b/i,
        /\b(\d{6})\b(?!\d)/,
      ];

      for (const p of [...patrones4, ...patrones6]) {
        const m = textoTotal.match(p);
        if (m) {
          valor = m[1] || m[0].replace(/\D/g, '');
          tipo  = 'codigo';
          break;
        }
      }

    } else if (servicio === 'disney') {
      // Disney+: código de 6 dígitos
      const patronesDisney = [
        /c[oó]digo[^\d]*(\d{6})\b/i,
        /code[^\d]*(\d{6})\b/i,
        /verification[^\d]*(\d{6})\b/i,
        /\b(\d{6})\b(?!\d)/,
      ];

      for (const p of patronesDisney) {
        const m = textoTotal.match(p);
        if (m) {
          valor = m[1];
          tipo  = 'codigo';
          break;
        }
      }
    }

    if (!valor) {
      return res.status(404).json({
        error: `No se encontró el código en el último email. Solicita el código en la app de ${
          servicio === 'disney' ? 'Disney+' : 'Netflix'
        } y vuelve a intentar en unos segundos.`,
        debug_asunto: mensajeRelevante.subject || '(sin asunto)',
        debug_remitente: mensajeRelevante.from?.address || '(desconocido)'
      });
    }

    // ── PASO 6: Marcar mensaje como leído (opcional, buena práctica) ──
    fetch(`${MAILTM_API}/messages/${mensajeRelevante.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/merge-patch+json'
      },
      body: JSON.stringify({ seen: true })
    }).catch(() => {}); // No bloquear si falla

    return res.status(200).json({
      success: true,
      valor,
      tipo,
      asunto: mensajeRelevante.subject || '',
      fecha: mensajeRelevante.createdAt || ''
    });

  } catch (err) {
    console.error('[ERROR api/codigo]', err);
    return res.status(500).json({
      error: 'Error interno del servidor. Intenta de nuevo en unos segundos.'
    });
  }
}
