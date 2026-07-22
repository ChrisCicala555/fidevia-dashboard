// Box proxy for EXTERNAL (non-Fidevia) users who have no Box account.
// Uses a Box service account (Client Credentials Grant). Exposes ONLY
// read / list / download / upload. It has NO edit, rename, move, or delete
// capability — so external users physically cannot alter existing Box files.

const AUTH0_DOMAIN = 'dev-477eis4yqjwd6d4g.us.auth0.com';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// --- Cache the service-account token in memory across warm invocations ---
let _svc = { token: null, exp: 0 };
async function serviceToken() {
  if (_svc.token && Date.now() < _svc.exp - 60000) return _svc.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.BOX_SVC_CLIENT_ID,
    client_secret: process.env.BOX_SVC_CLIENT_SECRET,
    box_subject_type: 'enterprise',
    box_subject_id: process.env.BOX_ENTERPRISE_ID
  });
  const r = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Service auth failed: ' + JSON.stringify(d));
  _svc = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return _svc.token;
}

// --- Validate the caller is a signed-in dashboard user (any authenticated user) ---
async function requireUser(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, { headers: { Authorization: auth } });
  if (!r.ok) return null;
  return r.json();
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const op = body.op;

  const t = await serviceToken();
  const H = { Authorization: 'Bearer ' + t };

  try {
    // ---- LIST a folder's items ----
    if (op === 'list') {
      const r = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.folderId)}/items?limit=200&fields=id,name,type`, { headers: H });
      if (!r.ok) return json({ error: 'Box list ' + r.status }, r.status);
      return json(await r.json());
    }

    // ---- READ file text content (used for CSV logs) ----
    if (op === 'readText') {
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}/content`, { headers: H });
      return json({ text: r.ok ? await r.text() : '' });
    }

    // ---- DOWNLOAD link: return a short-lived direct download URL ----
    if (op === 'downloadUrl') {
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}/content`, { headers: H, redirect: 'manual' });
      const loc = r.headers.get('location');
      if (!loc) return json({ error: 'No download URL' }, 502);
      return json({ url: loc });
    }

    // ---- GET file metadata ----
    if (op === 'fileInfo') {
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}?fields=id,name,size,modified_at`, { headers: H });
      if (!r.ok) return json({ error: 'Box file ' + r.status }, r.status);
      return json(await r.json());
    }

    // ---- UPLOAD a NEW file (creates only; never overwrites an existing file) ----
    if (op === 'upload') {
      // Refuse if a file of the same name already exists (prevents overwriting existing content)
      const chk = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      if (chk.ok) {
        const items = (await chk.json()).entries || [];
        if (items.some(i => i.type === 'file' && i.name === body.filename)) {
          return json({ error: 'A file with that name already exists. External users cannot overwrite files.' }, 409);
        }
      }
      const bytes = Uint8Array.from(atob(body.contentBase64), c => c.charCodeAt(0));
      const form = new FormData();
      form.append('attributes', JSON.stringify({ name: body.filename, parent: { id: String(body.folderId) } }));
      form.append('file', new Blob([bytes], { type: body.mime || 'application/octet-stream' }), body.filename);
      const r = await fetch('https://upload.box.com/api/2.0/files/content', { method: 'POST', headers: H, body: form });
      if (!r.ok) return json({ error: 'Upload failed ' + r.status + ': ' + (await r.text()) }, r.status);
      return json({ ok: true, file: await r.json() });
    }

    // Any other op (update, delete, rename, move) is intentionally unsupported.
    return json({ error: 'Operation not permitted for external users: ' + op }, 403);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/box-proxy' };
