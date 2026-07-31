const ROOT_NAME = 'Construction Dashboard';
const PROJECT = 'Lincoln';
let _svc = { token: null, exp: 0 };
async function serviceToken() {
  if (_svc.token && Date.now() < _svc.exp - 60000) return _svc.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.BOX_SVC_CLIENT_ID, client_secret: process.env.BOX_SVC_CLIENT_SECRET, box_subject_type: 'enterprise', box_subject_id: process.env.BOX_ENTERPRISE_ID });
  const r = await fetch('https://api.box.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json(); if (!d.access_token) return null;
  _svc = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 }; return _svc.token;
}
const H = t => ({ Authorization: 'Bearer ' + t });
async function list(t, id) { const r = await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`, { headers: H(t) }); return r.ok ? (await r.json()).entries || [] : []; }
const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function parseCSV(text) { if (!text || !text.trim()) return { headers: [], rows: [] }; const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length); const pl = line => { const res = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === ',' && !q) { res.push(cur.trim()); cur = ''; } else cur += c; } res.push(cur.trim()); return res; }; const headers = pl(lines[0]); const rows = lines.slice(1).map(l => { const v = pl(l), o = {}; headers.forEach((h, i) => o[h] = v[i] !== undefined ? v[i] : ''); return o; }); return { headers, rows }; }
function toCSV(headers, rows) { return headers.join(',') + '\n' + rows.map(r => headers.map(h => csvEsc(r[h])).join(',')).join('\n') + '\n'; }
async function findFile(t, folderId, name) { return (await list(t, folderId)).find(i => i.type === 'file' && i.name === name); }
async function readText(t, fileId) { const r = await fetch(`https://api.box.com/2.0/files/${fileId}/content`, { headers: H(t) }); return r.ok ? await r.text() : ''; }
async function writeCSV(t, folderId, name, headers, rows) {
  const existing = await findFile(t, folderId, name);
  const out = toCSV(headers, rows);
  const form = new FormData();
  form.append('attributes', JSON.stringify(existing ? { name } : { name, parent: { id: String(folderId) } }));
  form.append('file', new Blob([new TextEncoder().encode(out)], { type: 'text/csv' }), name);
  const url = existing ? `https://upload.box.com/api/2.0/files/${existing.id}/content` : 'https://upload.box.com/api/2.0/files/content';
  const r = await fetch(url, { method: 'POST', headers: H(t), body: form });
  return r.ok;
}

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== 'fidevia-seed-9x2') return new Response('nope', { status: 403 });
  const t = await serviceToken(); if (!t) return new Response('no token', { status: 500 });
  const root = (await list(t, '0')).find(i => i.type === 'folder' && i.name === ROOT_NAME);
  if (!root) return new Response('no root');
  const proj = (await list(t, root.id)).find(i => i.type === 'folder' && i.name.includes(PROJECT));
  if (!proj) return new Response('no lincoln');
  const subs = await list(t, proj.id);
  const gf = pfx => { const f = subs.find(i => i.type === 'folder' && i.name.startsWith(pfx)); return f ? f.id : null; };
  const log = [];

  // ---- PAYMENT APPLICATIONS: fresh new-schema demo ----
  const PAY_HEADERS = ['App #','Contractor','Company','Period From','Period To','Period','Due Date','Contract Amount','Approved Change Orders','Previously Paid','Requested Amount','Remaining on Contract','Approved Amount','Status','Action','Reviewed By','Review Date','Attachment File ID','Attachment Name','Signed File ID','Signed File Name','Version History'];
  const vh = (arr) => JSON.stringify(arr);
  const pay = [
    { 'App #':'PA-001','Contractor':'Summit Builders','Company':'Summit Builders Inc.','Period':'2026-06-30','Due Date':'2026-07-15','Contract Amount':'12000000','Approved Change Orders':'250000','Previously Paid':'0','Requested Amount':'1200000','Remaining on Contract':'11050000','Approved Amount':'1200000','Status':'Approved & Signed','Action':'Approve and Sign','Reviewed By':'Andre Martin','Review Date':'2026-07-12','Version History':vh([{v:1,fileId:'',fileName:'Summit PA-001.pdf',status:'Submitted',date:'2026-07-01',by:'Summit Builders',note:'Submitted'},{v:2,fileId:'',fileName:'Summit PA-001 signed.pdf',status:'Approved & Signed',date:'2026-07-12',by:'Andre Martin',note:'Approve and Sign · $1,200,000'}]) },
    { 'App #':'PA-002','Contractor':'Summit Builders','Company':'Summit Builders Inc.','Period':'2026-07-31','Due Date':'2026-08-15','Contract Amount':'12000000','Approved Change Orders':'250000','Previously Paid':'1200000','Requested Amount':'950000','Remaining on Contract':'10100000','Approved Amount':'','Status':'Submitted','Action':'','Version History':vh([{v:1,fileId:'',fileName:'Summit PA-002.pdf',status:'Submitted',date:'2026-08-01',by:'Summit Builders',note:'Submitted'}]) },
    { 'App #':'PA-001','Contractor':'Comfort Systems','Company':'Comfort Systems USA','Period':'2026-07-31','Due Date':'2026-08-15','Contract Amount':'4500000','Approved Change Orders':'0','Previously Paid':'0','Requested Amount':'450000','Remaining on Contract':'4070000','Approved Amount':'430000','Status':'Modified & Signed','Action':'Modify and Sign','Reviewed By':'Andre Martin','Review Date':'2026-08-10','Version History':vh([{v:1,fileId:'',fileName:'Comfort PA-001.pdf',status:'Submitted',date:'2026-08-01',by:'Comfort Systems',note:'Submitted'},{v:2,fileId:'',fileName:'Comfort PA-001 signed.pdf',status:'Modified & Signed',date:'2026-08-10',by:'Andre Martin',note:'Modify and Sign · $430,000 (stored materials adjusted)'}]) },
    { 'App #':'PA-001','Contractor':'AH Plumbing','Company':'AH Plumbing LLC','Period':'2026-07-31','Due Date':'2026-08-15','Contract Amount':'1800000','Approved Change Orders':'0','Previously Paid':'0','Requested Amount':'180000','Remaining on Contract':'1620000','Approved Amount':'180000','Status':'Approved & Signed','Action':'Approve and Sign','Reviewed By':'Andre Martin','Review Date':'2026-08-09','Version History':vh([{v:1,fileId:'',fileName:'AH PA-001.pdf',status:'Submitted',date:'2026-08-02',by:'AH Plumbing',note:'Submitted'},{v:2,fileId:'',fileName:'AH PA-001 signed.pdf',status:'Approved & Signed',date:'2026-08-09',by:'Andre Martin',note:'Approve and Sign · $180,000'}]) },
    { 'App #':'PA-001','Contractor':'Voltage Electric','Company':'Voltage Electric Co.','Period':'2026-07-31','Due Date':'2026-08-15','Contract Amount':'3200000','Approved Change Orders':'0','Previously Paid':'0','Requested Amount':'320000','Remaining on Contract':'2880000','Approved Amount':'','Status':'Submitted','Action':'','Version History':vh([{v:1,fileId:'',fileName:'Voltage PA-001.pdf',status:'Submitted',date:'2026-08-03',by:'Voltage Electric',note:'Submitted'}]) },
  ];
  const payF = gf('09'); if (payF) { await writeCSV(t, payF, 'Payment Applications.csv', PAY_HEADERS, pay); log.push('pay apps: ' + pay.length); }

  // ---- add Version History threads to first Submittal / RFI / CO ----
  const patch = async (folderId, filename, idField, versions, newStatus) => {
    if (!folderId) return;
    const f = await findFile(t, folderId, filename); if (!f) { log.push(filename + ': not found'); return; }
    const { headers, rows } = parseCSV(await readText(t, f.id));
    if (!rows.length) { log.push(filename + ': empty'); return; }
    if (!headers.includes('Version History')) headers.push('Version History');
    rows[0]['Version History'] = JSON.stringify(versions);
    if (newStatus && headers.includes('Status')) rows[0]['Status'] = newStatus;
    await writeCSV(t, folderId, filename, headers, rows);
    log.push(filename + ': threaded ' + (rows[0][idField] || ''));
  };
  await patch(gf('03'), 'Submittals Log.csv', 'Submittal #', [
    { v:1, fileId:'', fileName:'Submittal rev A.pdf', status:'Under Review', date:'2026-06-15', by:'Comfort Systems', note:'Initial submission' },
    { v:2, fileId:'', fileName:'Submittal rev A markup.pdf', status:'Revise and Resubmit', date:'2026-06-20', by:'Andre Martin', note:'Revise duct routing on sheet M-3' },
    { v:3, fileId:'', fileName:'Submittal rev B.pdf', status:'Approved', date:'2026-06-27', by:'Andre Martin', note:'Approved as revised' },
  ], 'Approved');
  await patch(gf('01'), 'RFI Log.csv', 'RFI #', [
    { v:1, fileId:'', fileName:'', status:'Open', date:'2026-06-10', by:'Summit Builders', note:'Submitted' },
    { v:2, fileId:'', fileName:'RFI response.pdf', status:'Answered', date:'2026-06-14', by:'Andre Martin', note:'See attached detail; proceed as clarified' },
  ], 'Answered');
  await patch(gf('02'), 'Change Order Log.csv', 'CO #', [
    { v:1, fileId:'', fileName:'', status:'Open', date:'2026-06-18', by:'Summit Builders', note:'Submitted for pricing' },
    { v:2, fileId:'', fileName:'CO signed.pdf', status:'Approved', date:'2026-06-25', by:'Andre Martin', note:'Approved' },
  ], 'Approved');

  return new Response(JSON.stringify({ ok: true, project: proj.name, log }), { headers: { 'Content-Type': 'application/json' } });
};
