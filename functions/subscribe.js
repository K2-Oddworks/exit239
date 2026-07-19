// Cloudflare Pages Function — POST /subscribe
// Adds an email to a Brevo contact list. The Brevo API key stays server-side,
// read from the BREVO_API_KEY environment variable (set it as a secret in the
// Cloudflare Pages project settings). BREVO_LIST_ID (numeric, comma-separated
// for multiple) is optional but recommended.

export async function onRequestPost({ request, env }) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'bad request' }, 400);
  }

  const email = (body && body.email ? String(body.email) : '').trim();
  const honeypot = body && body.company ? String(body.company).trim() : '';

  // Hidden honeypot field was filled — almost certainly a bot. Pretend success.
  if (honeypot) return json({ ok: true });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid email' }, 400);
  }

  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) return json({ error: 'not configured' }, 500);

  const payload = { email, updateEnabled: true };
  // Defaults to list 5; override with BREVO_LIST_ID (numeric, comma-separated).
  const listSource = env.BREVO_LIST_ID || '5';
  if (listSource) {
    const ids = String(listSource)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (ids.length) payload.listIds = ids;
  }

  let res;
  try {
    res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return json({ error: 'upstream error' }, 502);
  }

  // 201 = created, 204 = existing contact updated (updateEnabled).
  if (res.status === 201 || res.status === 204) return json({ ok: true });

  let data = {};
  try {
    data = await res.json();
  } catch (e) {}

  // Existing contact when update is off — treat as already subscribed.
  if (data && data.code === 'duplicate_parameter') {
    return json({ ok: true, already: true });
  }

  return json({ error: (data && data.message) || 'subscribe failed' }, 502);
}
