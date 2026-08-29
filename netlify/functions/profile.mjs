import { getStore } from '@netlify/blobs';

const AUTH0_DOMAIN = 'login.fidevia.com';
const AUTH0_DOMAIN_FALLBACK = 'dev-477eis4yqjwd6d4g.us.auth0.com';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing token' }, 401);

  // Validate the caller's Auth0 session and get their identity
  let userinfo = null;
  for (const d of [AUTH0_DOMAIN, AUTH0_DOMAIN_FALLBACK]) {
    try { const r = await fetch(`https://${d}/userinfo`, { headers: { Authorization: auth } }); if (r.ok) { userinfo = await r.json(); break; } } catch (e) {}
  }
  if (!userinfo) return json({ error: 'Invalid token' }, 401);
  const sub = userinfo.sub;

  const store = getStore('profiles');

  if (req.method === 'GET') {
    let profile = await store.get(sub, { type: 'json' });
    // First sign-in: if Fidevia added this person to the directory before they
    // had an account, adopt that record under their real sub. Without this the
    // placeholder would linger and the directory would show them twice.
    if (!profile) {
      const em = String(userinfo.email || '').trim().toLowerCase();
      if (em) {
        const key = 'pending|' + em;
        const placeholder = await store.get(key, { type: 'json' });
        if (placeholder) {
          delete placeholder.pending;
          placeholder.sub = sub;
          placeholder.email = userinfo.email || em;
          // Keep what Fidevia typed. The person is about to see these values on
          // the profile screen and may overwrite any of them; without this the
          // original entry would vanish with nothing to compare against.
          placeholder.entered = {
            first_name: placeholder.first_name || '',
            last_name:  placeholder.last_name  || '',
            company:    placeholder.company    || '',
            title:      placeholder.title      || '',
            phone:      placeholder.phone      || '',
            by:         placeholder.added_by   || '',
            at:         placeholder.added_at   || ''
          };
          await store.setJSON(sub, placeholder);
          await store.delete(key);
          profile = placeholder;
        }
      }
    }
    return json({ profile: profile || null });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
    const s = (v) => String(v ?? '').slice(0, 200);
    // The record is rebuilt from a fixed field list, so anything not named here
    // is lost on save. The original entry has to survive that.
    const prev = await store.get(sub, { type: 'json' });
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
    if (prev && prev.entered) profile.entered = prev.entered;
    await store.setJSON(sub, profile);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/profile' };
