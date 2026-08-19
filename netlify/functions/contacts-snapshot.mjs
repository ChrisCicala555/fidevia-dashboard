import { getStore } from '@netlify/blobs';

// Retry Box calls that come back rate-limited. This job runs unattended, so a
// silent 429 means a snapshot is never written and nobody finds out.
const _sleep = ms => new Promise(r => setTimeout(r, ms));
async function boxFetch(url, opts, tries = 4) {
  const method = ((opts && opts.method) || 'GET').toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD';
  for (let i = 0; i < tries; i++) {
    let r;
    try { r = await fetch(url, opts); }
    catch (e) { if (i === tries - 1) throw e; await _sleep(Math.min(400 * 2 ** i, 6000) + Math.random() * 250); continue; }
    const retryable = r.status === 429 || (idempotent && r.status >= 500 && r.status < 600);
    if (!retryable || i === tries - 1) return r;
    const ra = parseFloat(r.headers.get('Retry-After') || '');
    const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10000) : Math.min(500 * 2 ** i, 8000);
    await _sleep(wait + Math.random() * 250);
  }
}


let _svc = { token: null, exp: 0 };
async function serviceToken() {
  if (_svc.token && Date.now() < _svc.exp - 60000) return _svc.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.BOX_SVC_CLIENT_ID, client_secret: process.env.BOX_SVC_CLIENT_SECRET, box_subject_type: 'enterprise', box_subject_id: process.env.BOX_ENTERPRISE_ID });
  const r = await boxFetch('https://api.box.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json(); if (!d.access_token) return null;
  _svc = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 }; return _svc.token;
}
const H = t => ({ Authorization: 'Bearer ' + t });
const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
async function list(t, id) { const r = await boxFetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`, { headers: H(t) }); return r.ok ? (await r.json()).entries || [] : []; }
async function ensureFolder(t, parent, name) { const items = await list(t, parent); const f = items.find(i => i.type === 'folder' && i.name === name); if (f) return f.id; const r = await boxFetch('https://api.box.com/2.0/folders', { method: 'POST', headers: { ...H(t), 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent: { id: String(parent) } }) }); if (r.ok) return (await r.json()).id; if (r.status === 409) { const it = await list(t, parent); const f2 = it.find(i => i.type === 'folder' && i.name === name); if (f2) return f2.id; } return null; }
async function uploadCSV(t, folder, name, text) {
  const items = await list(t, folder); const ex = items.find(i => i.type === 'file' && i.name === name);
  const form = new FormData();
  form.append('attributes', JSON.stringify(ex ? { name } : { name, parent: { id: String(folder) } }));
  form.append('file', new Blob([new TextEncoder().encode(text)], { type: 'text/csv' }), name);
  const url = ex ? `https://upload.box.com/api/2.0/files/${ex.id}/content` : 'https://upload.box.com/api/2.0/files/content';
  const r = await boxFetch(url, { method: 'POST', headers: H(t), body: form }); return r.ok;
}

export default async () => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  if (tomorrow.getUTCMonth() === now.getUTCMonth()) return new Response('not last day of month');

  const t = await serviceToken(); if (!t) return new Response('no token', { status: 500 });
  const store = getStore('profiles');
  const rows = [];
  try {
    const { blobs } = await store.list();
    for (const b of (blobs || [])) {
      try { const p = await store.get(b.key, { type: 'json' }); if (p && p.email) rows.push([(((p.first_name || '') + ' ' + (p.last_name || '')).trim()) || p.email, p.company || '', p.title || '', p.email, p.phone || '']); } catch (e) {}
    }
  } catch (e) {}
  rows.sort((a, b) => a[0].localeCompare(b[0]));

  const csv = ['Name', 'Company', 'Role', 'Email', 'Phone'].join(',') + '\n' + rows.map(r => r.map(csvEsc).join(',')).join('\n') + '\n';
  const parent = process.env.BOX_PROJECTS_ROOT_ID;
  const snapF = await ensureFolder(t, parent, 'Contact Directory Snapshots');
  if (!snapF) return new Response('no folder', { status: 500 });
  const ymd = now.toISOString().slice(0,10);
  const ok = await uploadCSV(t, snapF, 'Contacts ' + ymd + '.csv', csv);
  return new Response(ok ? ('saved ' + rows.length + ' contacts to Contacts ' + ymd + '.csv') : 'upload failed', { status: ok ? 200 : 500 });
};

export const config = { schedule: '0 23 * * *' };
