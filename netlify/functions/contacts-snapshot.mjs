import { getStore } from '@netlify/blobs';

let _svc = { token: null, exp: 0 };
async function serviceToken() {
  if (_svc.token && Date.now() < _svc.exp - 60000) return _svc.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.BOX_SVC_CLIENT_ID, client_secret: process.env.BOX_SVC_CLIENT_SECRET, box_subject_type: 'enterprise', box_subject_id: process.env.BOX_ENTERPRISE_ID });
  const r = await fetch('https://api.box.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json(); if (!d.access_token) return null;
  _svc = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 }; return _svc.token;
}
const H = t => ({ Authorization: 'Bearer ' + t });
const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
async function list(t, id) { const r = await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`, { headers: H(t) }); return r.ok ? (await r.json()).entries || [] : []; }
async function ensureFolder(t, parent, name) { const items = await list(t, parent); const f = items.find(i => i.type === 'folder' && i.name === name); if (f) return f.id; const r = await fetch('https://api.box.com/2.0/folders', { method: 'POST', headers: { ...H(t), 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent: { id: String(parent) } }) }); if (r.ok) return (await r.json()).id; if (r.status === 409) { const it = await list(t, parent); const f2 = it.find(i => i.type === 'folder' && i.name === name); if (f2) return f2.id; } return null; }
async function uploadCSV(t, folder, name, text) {
  const items = await list(t, folder); const ex = items.find(i => i.type === 'file' && i.name === name);
  const form = new FormData();
  form.append('attributes', JSON.stringify(ex ? { name } : { name, parent: { id: String(folder) } }));
  form.append('file', new Blob([new TextEncoder().encode(text)], { type: 'text/csv' }), name);
  const url = ex ? `https://upload.box.com/api/2.0/files/${ex.id}/content` : 'https://upload.box.com/api/2.0/files/content';
  const r = await fetch(url, { method: 'POST', headers: H(t), body: form }); return r.ok;
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
  const ym = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
  const ok = await uploadCSV(t, snapF, 'Contacts ' + ym + '.csv', csv);
  return new Response(ok ? ('saved ' + rows.length + ' contacts to Contacts ' + ym + '.csv') : 'upload failed', { status: ok ? 200 : 500 });
};

export const config = { schedule: '0 23 * * *' };
