// api/test.js — ENDPOINT DE DIAGNÓSTICO TEMPORAL
// Úsalo para ver qué pasa exactamente con mail.tm
// ELIMÍNALO después de solucionar el problema

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { correo, pass } = req.query;

  if (!correo || !pass) {
    return res.status(400).json({ 
      error: 'Usa: /api/test?correo=TU@sharebot.net&pass=TUCONTRASEÑA' 
    });
  }

  const resultados = {};

  // TEST 1: Ver dominios disponibles en mail.tm
  try {
    const r = await fetch('https://api.mail.tm/domains');
    const txt = await r.text();
    resultados.dominios = { status: r.status, body: txt.substring(0, 500) };
  } catch (e) {
    resultados.dominios = { error: e.message };
  }

  // TEST 2: Intentar login
  try {
    const r = await fetch('https://api.mail.tm/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: correo, password: pass })
    });
    const txt = await r.text();
    resultados.login = { 
      status: r.status, 
      ok: r.ok,
      body: txt.substring(0, 500) 
    };
  } catch (e) {
    resultados.login = { error: e.message };
  }

  return res.status(200).json(resultados);
}
