module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { correo, pass } = req.query;
  if (!correo || !pass) {
    return res.status(200).json({ msg: 'Usa ?correo=TU@sharebot.net&pass=TUPASS' });
  }

  const out = {};

  // Test 1: ¿Vercel llega a mail.tm?
  try {
    const r = await fetch('https://api.mail.tm/domains');
    out.dominios_status = r.status;
    out.dominios_body = (await r.text()).substring(0, 200);
  } catch (e) {
    out.dominios_error = e.message;
  }

  // Test 2: Login
  try {
    const r = await fetch('https://api.mail.tm/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: correo, password: pass })
    });
    out.login_status = r.status;
    out.login_body = (await r.text()).substring(0, 400);
  } catch (e) {
    out.login_error = e.message;
  }

  return res.status(200).json(out);
};
