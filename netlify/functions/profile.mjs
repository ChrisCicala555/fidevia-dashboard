import { getStore } from '@netlify/blobs';

const AUTH0_DOMAIN = 'dev-477eis4yqjwd6d4g.us.auth0.com';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing token' }, 401);

  // Validate the caller's Auth0 session and get their identity
  const uiRes = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, { headers: { Authorization: auth } });
  if (!uiRes.ok) return json({ error: 'Invalid token' }, 401);
  const userinfo = await uiRes.json();
  const sub = userinfo.sub;

  const store = getStore('profiles');

  if (req.method === 'GET') {
    const profile = await store.get(sub, { type: 'json' });
    return json({ profile: profile || null });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
    const s = (v) => String(v ?? '').slice(0, 200);
    const profile = {
      first_name: s(body.first_name),
      last_name: s(body.last_name),
      phone: s(body.phone),
      company: s(body.company),
      title: s(body.title),
      involvement: s(body.involvement),
      email: userinfo.email || s(body.email),
      sub,
      onboarded: true,
      updated_at: new Date().toISOString()
    };
    await store.setJSON(sub, profile);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/profile' };
