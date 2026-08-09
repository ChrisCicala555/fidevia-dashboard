import { getStore } from '@netlify/blobs';

const AUTH0_DOMAIN = 'dev-477eis4yqjwd6d4g.us.auth0.com';
const ADMIN_DOMAIN = 'fidevia.com';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const csvEsc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function parseCSVServer(text){
  if(!text || !text.trim()) return { headers:[], rows:[] };
  const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.length);
  const parseLine = (line)=>{ const res=[]; let cur='', inQ=false; for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; } else if(c===','&&!inQ){ res.push(cur.trim()); cur=''; } else cur+=c; } res.push(cur.trim()); return res; };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l=>{ const v=parseLine(l), o={}; headers.forEach((h,i)=>o[h]=v[i]!==undefined?v[i]:''); return o; });
  return { headers, rows };
}
function toCSVServer(headers, rows){ return headers.join(',') + '\n' + rows.map(r=>headers.map(h=>csvEsc(r[h])).join(',')).join('\n') + '\n'; }

// --- Service-account (Client Credentials Grant) token, cached across warm invocations ---
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
  const r = await fetch('https://api.box.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json();
  if (!d.access_token) throw new Error('Service auth failed');
  _svc = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return _svc.token;
}

// --- Identify the caller from their Auth0 token ---
async function caller(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, { headers: { Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  const email = (u.email || '').toLowerCase();
  const admins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const blobAdmins = await getBlobAdmins();
  const isAdmin = (!!email && email.endsWith('@' + ADMIN_DOMAIN)) || admins.includes(email) || blobAdmins.includes(email);
  return { sub: u.sub, email, name: u.name || u.given_name || '', isAdmin };
}

// --- Grants store: key = external email, value = { projects:[{id,name}] } ---
const grantsStore = () => getStore('access-grants');
const requestsStore = () => getStore('access-requests');
const notifStore = () => getStore('notif-templates');
const reminderStore = () => getStore('reminder-settings');
const archivedStore = () => getStore('archived-projects');
async function getArchivedIds(){ try{ const d=await archivedStore().get('ids',{type:'json'}); return Array.isArray(d)?d.map(String):[]; }catch(e){ return []; } }
const adminListStore = () => getStore('admin-list');
async function getBlobAdmins(){ try{ const d=await adminListStore().get('emails',{type:'json'}); return Array.isArray(d)?d:[]; }catch(e){ return []; } }
const PANEL_PW = () => process.env.ADMIN_PANEL_PASSWORD || '';
async function getProfileBySub(sub){ try{ return await getStore('profiles').get(sub, { type:'json' }); }catch(e){ return null; } }
async function addContactToProject(H, projectId, contact){
  const CH = ['Name','Company','Role','Email','Phone','Notify - RFI','Notify - CO','Notify - Submittal'];
  const fname = 'Job Contacts.csv';
  const lr = await fetch(`https://api.box.com/2.0/folders/${projectId}/items?limit=1000&fields=id,name,type`, { headers: H });
  const items = lr.ok ? ((await lr.json()).entries || []) : [];
  const cf = items.find(i => i.type === 'folder' && /^0?5\b|^05/.test(i.name) || (i.type==='folder' && i.name.toLowerCase().includes('contact')));
  if (!cf) return;
  const flr = await fetch(`https://api.box.com/2.0/folders/${cf.id}/items?limit=1000&fields=id,name,type`, { headers: H });
  const fitems = flr.ok ? ((await flr.json()).entries || []) : [];
  const existing = fitems.find(i => i.type === 'file' && i.name === fname);
  let current = '';
  if (existing) { const cr = await fetch(`https://api.box.com/2.0/files/${existing.id}/content`, { headers: H }); current = cr.ok ? await cr.text() : ''; }
  if (current && contact.Email && current.toLowerCase().includes(String(contact.Email).toLowerCase())) return; // already a contact
  const rowLine = CH.map(h => csvEsc(contact[h])).join(',');
  let out, url, attrs;
  if (existing) { out = current.replace(/\s*$/, '') + '\n' + rowLine + '\n'; url = `https://upload.box.com/api/2.0/files/${existing.id}/content`; attrs = JSON.stringify({ name: fname }); }
  else { out = CH.join(',') + '\n' + rowLine + '\n'; url = 'https://upload.box.com/api/2.0/files/content'; attrs = JSON.stringify({ name: fname, parent: { id: String(cf.id) } }); }
  const form = new FormData(); form.append('attributes', attrs); form.append('file', new Blob([new TextEncoder().encode(out)], { type: 'text/csv' }), fname);
  await fetch(url, { method: 'POST', headers: H, body: form });
}
function contactFromSnap(snap, email){
  return { 'Name': (snap && snap.name) || '', 'Company': (snap && snap.company) || '', 'Role': (snap && snap.role) || '', 'Email': email, 'Phone': (snap && snap.phone) || '', 'Notify - RFI':'Yes','Notify - CO':'Yes','Notify - Submittal':'Yes' };
}
async function sendGrantEmail(email, projectName){
  const key = process.env.SENDGRID_KEY; if(!key || !email) return;
  const from = process.env.FROM_EMAIL || 'clymerllc@gmail.com';
  const url = process.env.SITE_URL || 'https://venerable-piroshki-0e0dd4.netlify.app/';
  const proj = projectName || 'a project';
  const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2ddd5;border-radius:8px;overflow:hidden">'
    + '<div style="background:#515520;padding:20px 24px"><span style="color:#fff;font-size:18px;font-weight:700">Fidevia</span><span style="color:#c8b97a;margin-left:8px;font-size:13px">Construction Dashboard</span></div>'
    + '<div style="padding:24px">'
    + '<p style="font-size:15px;color:#1a1a1a">You have been granted access to <strong>' + proj.replace(/</g,'&lt;') + '</strong> on the Fidevia Construction Dashboard.</p>'
    + '<p style="font-size:14px;color:#444">To view the project, sign in with your account &mdash; or create one if you do not have one yet using this same email address (' + String(email).replace(/</g,'&lt;') + ').</p>'
    + '<p style="margin:24px 0"><a href="' + url + '" style="background:#515520;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;display:inline-block">Open the Fidevia Dashboard</a></p>'
    + '<p style="font-size:12px;color:#999">If the button does not work, copy and paste this link: ' + url + '</p>'
    + '</div></div>';
  const payload = { personalizations:[{to:[{email}]}], from:{email:from,name:'Fidevia Dashboard'}, subject:'You have been granted access to ' + proj + ' \u2014 Fidevia Dashboard', content:[{type:'text/html',value:html}] };
  await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
const reqKey = (projectId, email) => `${projectId}__${email}`;
async function getGrants(email) { const g = await grantsStore().get(email, { type: 'json' }); return (g && g.projects) ? g.projects : []; }
const PRIVATE_CSV = { 'Payment Applications.csv': 'Contractor', 'Contractor Daily Reports.csv': 'Company', 'Certified Payrolls.csv': 'Company' };
const SYSTEM_FOLDERS = ['Contact Directory Snapshots'];
async function callerCompanyFor(t, grants, kind, id) {
  const gidset = new Set(grants.map(g => String(g.id)));
  let pid = null;
  if (gidset.has(String(id))) pid = String(id);
  else {
    const path = kind === 'folder' ? `folders/${id}?fields=path_collection` : `files/${id}?fields=path_collection`;
    const r = await fetch('https://api.box.com/2.0/' + path, { headers: { Authorization: 'Bearer ' + t } });
    if (r.ok) { const d = await r.json(); const ids = ((d.path_collection && d.path_collection.entries) || []).map(e => String(e.id)); pid = ids.find(x => gidset.has(x)); }
  }
  const g = grants.find(x => String(x.id) === String(pid));
  return g ? (g.company || '') : '';
}

// --- Verify a folder/file lives inside one of the granted project folders ---
async function withinGranted(t, grantedIds, kind, id) {
  if (grantedIds.has(String(id))) return true;
  const path = kind === 'folder' ? `folders/${id}?fields=path_collection` : `files/${id}?fields=path_collection`;
  const r = await fetch('https://api.box.com/2.0/' + path, { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) return false;
  const d = await r.json();
  const ids = ((d.path_collection && d.path_collection.entries) || []).map(e => String(e.id));
  return ids.some(x => grantedIds.has(x));
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const who = await caller(req);
  if (!who) return json({ error: 'Not authenticated' }, 401);

  let body; try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
  const op = body.op;
  const t = await serviceToken();
  const H = { Authorization: 'Bearer ' + t };

  try {
    // ---- WHOAMI (any authenticated user) ----
    if (op === 'whoami') return json({ email: who.email, isAdmin: who.isAdmin });

    // ---- ADMIN LIST PANEL (password-gated) ----
    if (op === 'adminPanelUnlock' || op === 'getAdminList' || op === 'setAdminList') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const pw = PANEL_PW();
      if (!pw || String(body.password || '') !== pw) return json({ error: 'Incorrect password' }, 403);
      if (op === 'adminPanelUnlock') return json({ ok: true });
      if (op === 'getAdminList') {
        const envAdmins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        return json({ customAdmins: await getBlobAdmins(), envAdmins, domain: ADMIN_DOMAIN });
      }
      if (op === 'setAdminList') {
        const emails = Array.isArray(body.emails) ? body.emails.map(e => String(e).toLowerCase().trim()).filter(Boolean) : [];
        await adminListStore().setJSON('emails', emails);
        return json({ ok: true });
      }
    }

    // ---- ADMIN OPS ----
    if (op === 'adminListProjects' || op === 'adminListGrants' || op === 'adminGrant' || op === 'adminRevoke') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);

      if (op === 'adminListProjects') {
        const r = await fetch(`https://api.box.com/2.0/folders/${process.env.BOX_PROJECTS_ROOT_ID}/items?limit=1000&fields=id,name,type`, { headers: H });
        const d = await r.json();
        return json({ projects: (d.entries || []).filter(e => e.type === 'folder' && !SYSTEM_FOLDERS.includes(e.name)).map(e => ({ id: e.id, name: e.name })) });
      }
      if (op === 'adminListGrants') {
        const store = grantsStore();
        const { blobs } = await store.list();
        const out = [];
        for (const b of blobs) { const g = await store.get(b.key, { type: 'json' }); if (g) out.push({ email: b.key, projects: g.projects || [] }); }
        return json({ grants: out });
      }
      if (op === 'adminGrant') {
        const email = (body.email || '').toLowerCase().trim();
        if (!email || !body.projectId) return json({ error: 'email and projectId required' }, 400);
        const company = (body.company || '').trim();
        const role = (body.role || '').trim();
        const store = grantsStore();
        const g = (await store.get(email, { type: 'json' })) || { projects: [] };
        const ex = g.projects.find(p => String(p.id) === String(body.projectId));
        if (ex) { ex.name = body.projectName || ex.name; ex.company = company || ex.company || ''; ex.role = role || ex.role || ''; }
        else { g.projects.push({ id: String(body.projectId), name: body.projectName || '', company, role }); }
        await store.setJSON(email, g);
        try { const c = contactFromSnap(null, email); if (company) c['Company'] = company; if (role) c['Role'] = role; await addContactToProject(H, String(body.projectId), c); } catch(e) {}
        try { await sendGrantEmail(email, body.projectName||''); } catch(e) {}
        return json({ ok: true });
      }
      if (op === 'adminRevoke') {
        const email = (body.email || '').toLowerCase().trim();
        const store = grantsStore();
        const g = (await store.get(email, { type: 'json' })) || { projects: [] };
        g.projects = g.projects.filter(p => String(p.id) !== String(body.projectId));
        await store.setJSON(email, g);
        return json({ ok: true });
      }
    }

    // ---- LIST ALL PROJECT NAMES (any authenticated user) for the request dropdown ----
    if (op === 'listAllProjectNames') {
      const r = await fetch(`https://api.box.com/2.0/folders/${process.env.BOX_PROJECTS_ROOT_ID}/items?limit=1000&fields=id,name,type`, { headers: H });
      const d = await r.json();
      return json({ projects: (d.entries || []).filter(e => e.type === 'folder' && !SYSTEM_FOLDERS.includes(e.name)).map(e => ({ id: e.id, name: e.name })) });
    }

    // ---- REQUEST ACCESS to a project (any authenticated user) ----
    if (op === 'requestAccess') {
      const projectId = String(body.projectId || '');
      if (!projectId) return json({ error: 'projectId required' }, 400);
      const prof = await getProfileBySub(who.sub);
      const snap = prof ? { name: ((prof.first_name||'')+' '+(prof.last_name||'')).trim()||who.name||'', company: prof.company||'', role: prof.title||prof.involvement||'', phone: prof.phone||'' } : { name: who.name||'' };
      await requestsStore().setJSON(reqKey(projectId, who.email), {
        email: who.email, name: who.name || '', snap, projectId, projectName: body.projectName || '', requestedAt: new Date().toISOString()
      });
      return json({ ok: true });
    }

    // ---- ADMIN: pending requests for a project ----
    if (op === 'listRequests') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const store = requestsStore();
      const { blobs } = await store.list({ prefix: String(body.projectId || '') + '__' });
      const out = [];
      for (const b of blobs) { const r = await store.get(b.key, { type: 'json' }); if (r) out.push(r); }
      return json({ requests: out });
    }
    if (op === 'approveRequest') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const email = (body.email || '').toLowerCase().trim();
      const projectId = String(body.projectId || '');
      const gstore = grantsStore();
      const g = (await gstore.get(email, { type: 'json' })) || { projects: [] };
      if (!g.projects.some(p => String(p.id) === projectId)) g.projects.push({ id: projectId, name: body.projectName || '' });
      await gstore.setJSON(email, g);
      // auto-add to the project's contacts with notifications ON
      const reqRec = await requestsStore().get(reqKey(projectId, email), { type: 'json' });
      try { await addContactToProject(H, projectId, contactFromSnap(reqRec && reqRec.snap, email)); } catch(e) {}
      try { await sendGrantEmail(email, body.projectName||''); } catch(e) {}
      await requestsStore().delete(reqKey(projectId, email));
      return json({ ok: true });
    }
    if (op === 'denyRequest') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const email = (body.email || '').toLowerCase().trim();
      await requestsStore().delete(reqKey(String(body.projectId || ''), email));
      return json({ ok: true });
    }

    // ---- EXTERNAL: the projects this caller has been granted ----
    if (op === 'myProjects') {
      const grants = await getGrants(who.email);
      const r = await fetch(`https://api.box.com/2.0/folders/${process.env.BOX_PROJECTS_ROOT_ID}/items?limit=1000&fields=id,name,type`, { headers: H });
      const d = await r.json();
      const existing = new Map((d.entries || []).filter(e => e.type === 'folder' && !SYSTEM_FOLDERS.includes(e.name)).map(e => [String(e.id), e.name]));
      const archived = new Set(await getArchivedIds());
      const mine = grants.filter(g => existing.has(String(g.id)) && !archived.has(String(g.id))).map(g => ({ id: g.id, name: existing.get(String(g.id)) || g.name, company: g.company || '', role: g.role || '' }));
      return json({ projects: mine });
    }

    // ---- DATA OPS: enforce grant scope for non-admins ----
    const _grants = who.isAdmin ? [] : await getGrants(who.email);
    const grantedIds = who.isAdmin ? null : new Set(_grants.map(p => String(p.id)));
    const guardFolder = async (fid) => who.isAdmin || (await withinGranted(t, grantedIds, 'folder', fid));
    const guardFile = async (fid) => who.isAdmin || (await withinGranted(t, grantedIds, 'file', fid));

    if (op === 'list') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const r = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.folderId)}/items?limit=200&fields=id,name,type`, { headers: H });
      if (!r.ok) return json({ error: 'Box list ' + r.status }, r.status);
      return json(await r.json());
    }
    if (op === 'readText') {
      if (!await guardFile(body.fileId)) return json({ error: 'Access denied' }, 403);
      let fname = '';
      try { const fi = await (await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}?fields=name`, { headers: H })).json(); fname = fi.name || ''; } catch (e) {}
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}/content`, { headers: H });
      let text = r.ok ? await r.text() : '';
      const field = PRIVATE_CSV[fname];
      if (field && !who.isAdmin) {
        const company = (await callerCompanyFor(t, _grants, 'file', body.fileId)).trim().toLowerCase();
        const parsed = parseCSVServer(text);
        const rows = company ? parsed.rows.filter(row => String(row[field] || '').trim().toLowerCase() === company) : [];
        text = toCSVServer(parsed.headers, rows);
      }
      return json({ text });
    }
    if (op === 'downloadUrl') {
      if (!await guardFile(body.fileId)) return json({ error: 'Access denied' }, 403);
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}/content`, { headers: H, redirect: 'manual' });
      const loc = r.headers.get('location');
      return loc ? json({ url: loc }) : json({ error: 'No download URL' }, 502);
    }
    if (op === 'fileInfo') {
      if (!await guardFile(body.fileId)) return json({ error: 'Access denied' }, 403);
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}?fields=id,name,size,modified_at`, { headers: H });
      if (!r.ok) return json({ error: 'Box file ' + r.status }, r.status);
      return json(await r.json());
    }
    if (op === 'upload') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const chk = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      if (chk.ok) { const items = (await chk.json()).entries || []; if (items.some(i => i.type === 'file' && i.name === body.filename)) return json({ error: 'A file with that name already exists.' }, 409); }
      const bytes = Uint8Array.from(atob(body.contentBase64), c => c.charCodeAt(0));
      const form = new FormData();
      form.append('attributes', JSON.stringify({ name: body.filename, parent: { id: String(body.folderId) } }));
      form.append('file', new Blob([bytes], { type: body.mime || 'application/octet-stream' }), body.filename);
      const r = await fetch('https://upload.box.com/api/2.0/files/content', { method: 'POST', headers: H, body: form });
      if (!r.ok) return json({ error: 'Upload failed ' + r.status }, r.status);
      return json({ ok: true, file: await r.json() });
    }

    if (op === 'ensureFolder') {
      if (!await guardFolder(body.parentId)) return json({ error: 'Access denied' }, 403);
      const name = String(body.name || '').trim();
      if (!name) return json({ error: 'name required' }, 400);
      const lr = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.parentId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = lr.ok ? ((await lr.json()).entries || []) : [];
      const found = items.find(i => i.type === 'folder' && i.name === name);
      if (found) return json({ ok: true, id: found.id });
      const cr = await fetch('https://api.box.com/2.0/folders', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent: { id: String(body.parentId) } }) });
      if (!cr.ok) {
        if (cr.status === 409) {
          const lr2 = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.parentId)}/items?limit=1000&fields=id,name,type`, { headers: H });
          const it2 = lr2.ok ? ((await lr2.json()).entries || []) : [];
          const f2 = it2.find(i => i.type === 'folder' && i.name === name);
          if (f2) return json({ ok: true, id: f2.id });
        }
        return json({ error: 'Folder create failed ' + cr.status }, cr.status);
      }
      const nf = await cr.json();
      return json({ ok: true, id: nf.id });
    }

    if (op === 'addVersion') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const { folderId, filename, idField, idValue } = body;
      if (!folderId || !filename || !idField) return json({ error: 'missing fields' }, 400);
      const lr = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = lr.ok ? ((await lr.json()).entries || []) : [];
      const logFile = items.find(i => i.type === 'file' && i.name === filename);
      if (!logFile) return json({ error: 'log not found' }, 404);
      const cr = await fetch(`https://api.box.com/2.0/files/${logFile.id}/content`, { headers: H });
      const text = cr.ok ? await cr.text() : '';
      const parsed = parseCSVServer(text);
      const headers = parsed.headers, rows = parsed.rows;
      const idx = rows.findIndex(r => String(r[idField] || '') === String(idValue || ''));
      if (idx < 0) return json({ error: 'item not found' }, 404);
      const row = rows[idx];
      let vh = []; try { vh = JSON.parse(row['Version History'] || '[]'); } catch (e) {}
      if (!vh.length) vh = [{ v:1, fileId:(row['Attachment File ID']||row['File ID']||''), fileName:(row['Attachment Name']||row['File Name']||''), status:(row['Status']||''), date:(row['Date Submitted']||row['Date']||''), by:(row['Submitted By']||row['Submitted By (Sub)']||row['Contractor']||''), note:'' }];
      vh.push({ v:vh.length+1, fileId:String(body.newFileId||''), fileName:String(body.newFileName||''), status:String(body.status||''), date:String(body.date||''), by:String(body.by||''), note:String(body.note||'') });
      if (!headers.includes('Version History')) headers.push('Version History');
      row['Version History'] = JSON.stringify(vh);
      if (headers.includes('Attachment File ID')) row['Attachment File ID'] = String(body.newFileId || row['Attachment File ID'] || '');
      if (headers.includes('File ID')) row['File ID'] = String(body.newFileId || row['File ID'] || '');
      if (headers.includes('Attachment Name')) row['Attachment Name'] = String(body.newFileName || row['Attachment Name'] || '');
      if (headers.includes('File Name')) row['File Name'] = String(body.newFileName || row['File Name'] || '');
      if (body.status && headers.includes('Status')) row['Status'] = String(body.status);
      const out = toCSVServer(headers, rows);
      const form = new FormData();
      form.append('attributes', JSON.stringify({ name: filename }));
      form.append('file', new Blob([new TextEncoder().encode(out)], { type: 'text/csv' }), filename);
      const ur = await fetch(`https://upload.box.com/api/2.0/files/${logFile.id}/content`, { method: 'POST', headers: H, body: form });
      if (!ur.ok) return json({ error: 'Save failed ' + ur.status }, ur.status);
      return json({ ok: true });
    }
    if (op === 'advanceWorkflow') {
      const { projectId, moduleFolderId, filename, wfKey, idField, idValue } = body;
      if (!await guardFolder(moduleFolderId)) return json({ error: 'Access denied' }, 403);
      if (!projectId || !moduleFolderId || !filename || !wfKey || !idField) return json({ error: 'missing fields' }, 400);
      // --- load project config (workflows) ---
      const pitems = (await (await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(projectId)}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      const cfgFile = pitems.find(e => e.type === 'file' && e.name === 'Project Info.json');
      let cfg = {}; if (cfgFile) { try { cfg = JSON.parse(await (await fetch(`https://api.box.com/2.0/files/${cfgFile.id}/content`, { headers: H })).text()) || {}; } catch (e) {} }
      const steps = ((cfg.workflows || {})[wfKey]) || [];
      if (!steps.length) return json({ error: 'No workflow configured' }, 400);
      // --- contacts: name -> email ---
      const emailByName = {};
      try {
        const contF = pitems.find(e => e.type === 'folder' && e.name.startsWith('05'));
        if (contF) {
          const cit = (await (await fetch(`https://api.box.com/2.0/folders/${contF.id}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
          const ccsv = cit.find(e => e.type === 'file' && e.name.toLowerCase().endsWith('.csv'));
          if (ccsv) { const cp = parseCSVServer(await (await fetch(`https://api.box.com/2.0/files/${ccsv.id}/content`, { headers: H })).text()); cp.rows.forEach(r => { if (r['Name']) emailByName[String(r['Name']).trim().toLowerCase()] = String(r['Email'] || '').trim().toLowerCase(); }); }
        }
      } catch (e) {}
      // --- load the log CSV ---
      const mitems = (await (await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(moduleFolderId)}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      const logFile = mitems.find(e => e.type === 'file' && e.name === filename);
      if (!logFile) return json({ error: 'log not found' }, 404);
      const parsed = parseCSVServer(await (await fetch(`https://api.box.com/2.0/files/${logFile.id}/content`, { headers: H })).text());
      const headers = parsed.headers, rows = parsed.rows;
      const row = rows.find(r => String(r[idField] || '') === String(idValue || ''));
      if (!row) return json({ error: 'item not found' }, 404);
      if (String(row['Workflow Status'] || '').toLowerCase() === 'complete') return json({ error: 'Workflow already complete' }, 400);
      // --- current parallel group ---
      let cur = parseInt(row['Workflow Step']); if (isNaN(cur)) cur = 0;
      let gs = cur; while (gs > 0 && steps[gs] && steps[gs].parallel) gs--;
      let ge = gs; while (ge + 1 < steps.length && steps[ge + 1] && steps[ge + 1].parallel) ge++;
      // --- authorize: caller must be an assignee of the current group (admins always allowed) ---
      const me = String(who.email || '').toLowerCase();
      const allowed = steps.slice(gs, ge + 1).some(s => {
        const direct = String(s.email || '').trim().toLowerCase();
        const viaName = emailByName[String(s.person || '').trim().toLowerCase()] || '';
        return (direct && direct === me) || (viaName && viaName === me);
      });
      if (!who.isAdmin && !allowed) return json({ error: 'This step is not assigned to you.' }, 403);
      // --- advance ---
      if (!headers.includes('Workflow Step')) headers.push('Workflow Step');
      if (!headers.includes('Workflow Status')) headers.push('Workflow Status');
      const next = ge + 1;
      if (next >= steps.length) { row['Workflow Step'] = String(steps.length - 1); row['Workflow Status'] = 'Complete'; }
      else { row['Workflow Step'] = String(next); row['Workflow Status'] = 'In Review'; }
      const out = headers.join(',') + '\n' + rows.map(r => headers.map(h => csvEsc(r[h])).join(',')).join('\n') + '\n';
      const form = new FormData();
      form.append('attributes', JSON.stringify({ name: filename }));
      form.append('file', new Blob([new TextEncoder().encode(out)], { type: 'text/csv' }), filename);
      const ur = await fetch(`https://upload.box.com/api/2.0/files/${logFile.id}/content`, { method: 'POST', headers: H, body: form });
      if (!ur.ok) return json({ error: 'Save failed ' + ur.status }, ur.status);
      const nextNames = next >= steps.length ? [] : steps.slice(next, next + 1).map(s => s.person || s.name);
      return json({ ok: true, complete: next >= steps.length, nextStep: nextNames });
    }
    if (op === 'appendRow') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const { folderId, filename, headers, row } = body;
      if (!Array.isArray(headers) || typeof row !== 'object') return json({ error: 'headers[] and row{} required' }, 400);
      const pfield = PRIVATE_CSV[filename];
      if (pfield && !who.isAdmin) {
        const company = await callerCompanyFor(t, _grants, 'folder', folderId);
        if (!company) return json({ error: 'Your access is not assigned to a company for this project.' }, 403);
        row[pfield] = company;
      }
      const rowLine = headers.map(h => csvEsc(row[h])).join(',');
      const lr = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = lr.ok ? ((await lr.json()).entries || []) : [];
      const existing = items.find(i => i.type === 'file' && i.name === filename);
      let out, uploadUrl, attrs;
      if (existing) {
        const cr = await fetch(`https://api.box.com/2.0/files/${existing.id}/content`, { headers: H });
        const current = cr.ok ? await cr.text() : '';
        out = current.replace(/\s*$/, '') + '\n' + rowLine + '\n';
        uploadUrl = `https://upload.box.com/api/2.0/files/${existing.id}/content`;
        attrs = JSON.stringify({ name: filename });
      } else {
        out = headers.join(',') + '\n' + rowLine + '\n';
        uploadUrl = 'https://upload.box.com/api/2.0/files/content';
        attrs = JSON.stringify({ name: filename, parent: { id: String(folderId) } });
      }
      const form = new FormData();
      form.append('attributes', attrs);
      form.append('file', new Blob([new TextEncoder().encode(out)], { type: 'text/csv' }), filename);
      const ur = await fetch(uploadUrl, { method: 'POST', headers: H, body: form });
      if (!ur.ok) return json({ error: 'Append failed ' + ur.status }, ur.status);
      return json({ ok: true });
    }

    if (op === 'getNotifTemplates') {
      const d = await notifStore().get(String(body.projectId), { type: 'json' });
      return json({ templates: d || null });
    }
    if (op === 'saveNotifTemplates') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      await notifStore().setJSON(String(body.projectId), body.templates || {});
      return json({ ok: true });
    }

    if (op === 'getReminderSettings') {
      const d = await reminderStore().get(String(body.projectId), { type: 'json' });
      return json({ settings: d || null });
    }
    if (op === 'saveReminderSettings') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      await reminderStore().setJSON(String(body.projectId), body.settings || {});
      return json({ ok: true });
    }

    if (op === 'allContacts') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const store = getStore('profiles');
      const out = [];
      try {
        const { blobs } = await store.list();
        for (const b of (blobs || [])) {
          try { const pr = await store.get(b.key, { type: 'json' }); if (pr && pr.email) out.push({ sub: b.key, name: (((pr.first_name || '') + ' ' + (pr.last_name || '')).trim()) || pr.email, email: pr.email, company: pr.company || '', role: pr.title || '', phone: pr.phone || '' }); } catch (e) {}
        }
      } catch (e) {}
      out.sort((a, b) => a.name.localeCompare(b.name));
      return json({ contacts: out });
    }
    if (op === 'setContactMeta') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const pw = PANEL_PW();
      if (!pw || String(body.password || '') !== pw) return json({ error: 'Incorrect password' }, 403);
      const sub = String(body.sub || ''); if (!sub) return json({ error: 'sub required' }, 400);
      const store = getStore('profiles');
      const pr = await store.get(sub, { type: 'json' }); if (!pr) return json({ error: 'not found' }, 404);
      if (body.company !== undefined) pr.company = String(body.company).slice(0, 200);
      if (body.role !== undefined) pr.title = String(body.role).slice(0, 200);
      if (body.phone !== undefined) pr.phone = String(body.phone).slice(0, 60);
      if (body.email !== undefined) pr.email = String(body.email).slice(0, 200);
      await store.setJSON(sub, pr);
      return json({ ok: true });
    }
    if (op === 'accountEmails') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const store = getStore('profiles');
      let emails = [];
      try {
        const { blobs } = await store.list();
        for (const b of (blobs || [])) {
          try { const pr = await store.get(b.key, { type: 'json' }); if (pr && pr.email) emails.push(String(pr.email).trim().toLowerCase()); } catch (e) {}
        }
      } catch (e) {}
      return json({ emails: [...new Set(emails)] });
    }
    if (op === 'projectCompanies') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const pid = String(body.projectId || ''); if (!pid) return json({ companies: [] });
      const companies = new Set();
      try {
        const items = (await (await fetch(`https://api.box.com/2.0/folders/${pid}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
        const cfgFile = items.find(e => e.type === 'file' && e.name === 'Project Info.json');
        if (cfgFile) { try { const cfg = JSON.parse(await (await fetch(`https://api.box.com/2.0/files/${cfgFile.id}/content`, { headers: H })).text()); (cfg.contractors || []).forEach(c => { if (c.name) companies.add(String(c.name).trim()); }); } catch(e) {} }
        const contF = items.find(e => e.type === 'folder' && e.name.startsWith('05'));
        if (contF) { const cit = (await (await fetch(`https://api.box.com/2.0/folders/${contF.id}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || []; const csv = cit.find(e => e.type === 'file' && e.name.toLowerCase().endsWith('.csv')); if (csv) { const parsed = parseCSVServer(await (await fetch(`https://api.box.com/2.0/files/${csv.id}/content`, { headers: H })).text()); parsed.rows.forEach(r => { if (r['Company']) companies.add(String(r['Company']).trim()); }); } }
      } catch(e) {}
      return json({ companies: [...companies].filter(Boolean) });
    }
    if (op === 'exportContacts') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const store = getStore('profiles');
      const rows = [];
      try { const { blobs } = await store.list(); for (const b of (blobs || [])) { try { const p2 = await store.get(b.key, { type: 'json' }); if (p2 && p2.email) rows.push([(((p2.first_name || '') + ' ' + (p2.last_name || '')).trim()) || p2.email, p2.company || '', p2.title || '', p2.email, p2.phone || '']); } catch (e) {} } } catch (e) {}
      rows.sort((a, b) => a[0].localeCompare(b[0]));
      const csv = ['Name','Company','Role','Email','Phone'].join(',') + '\n' + rows.map(r => r.map(csvEsc).join(',')).join('\n') + '\n';
      const parent = process.env.BOX_PROJECTS_ROOT_ID;
      const pit = (await (await fetch(`https://api.box.com/2.0/folders/${parent}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      let snap = pit.find(e => e.type === 'folder' && e.name === 'Contact Directory Snapshots');
      let snapId = snap ? snap.id : null;
      if (!snapId) { const cr = await fetch('https://api.box.com/2.0/folders', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Contact Directory Snapshots', parent: { id: String(parent) } }) }); if (cr.ok) snapId = (await cr.json()).id; }
      if (!snapId) return json({ error: 'Could not create snapshot folder' }, 500);
      const name = 'Contacts ' + new Date().toISOString().slice(0, 10) + '.csv';
      const items = (await (await fetch(`https://api.box.com/2.0/folders/${snapId}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      const ex = items.find(e => e.type === 'file' && e.name === name);
      const form = new FormData();
      form.append('attributes', JSON.stringify(ex ? { name } : { name, parent: { id: String(snapId) } }));
      form.append('file', new Blob([new TextEncoder().encode(csv)], { type: 'text/csv' }), name);
      const url = ex ? `https://upload.box.com/api/2.0/files/${ex.id}/content` : 'https://upload.box.com/api/2.0/files/content';
      const r = await fetch(url, { method: 'POST', headers: H, body: form });
      if (!r.ok) return json({ error: 'Upload failed ' + r.status }, r.status);
      return json({ ok: true, count: rows.length, file: name });
    }
    if (op === 'scheduleArchive') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const pid = String(body.projectId || ''); const when = String(body.date || '');
      if (!pid || !when) return json({ error: 'projectId and date required' }, 400);
      const store = getStore('archive-scheduled');
      await store.setJSON(pid, { projectId: pid, projectName: body.projectName || '', date: when, notified: true });
      // notify external users granted to this project
      let sent = 0;
      try {
        const gstore = grantsStore();
        const { blobs } = await gstore.list();
        const emails = [];
        for (const b of blobs) { const g = await gstore.get(b.key, { type: 'json' }); if (g && (g.projects || []).some(p2 => String(p2.id) === pid)) emails.push(b.key); }
        if (emails.length) {
          const origin = 'https://venerable-piroshki-0e0dd4.netlify.app';
          const html = `<div style="background:#f4f2ec;padding:28px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2ddd5;border-radius:12px;overflow:hidden"><tr><td style="padding:26px 24px 12px;text-align:center"><img src="${origin}/fidevia-email-logo.png" alt="Fidevia" width="164" style="display:block;margin:0 auto 6px;max-width:164px;height:auto"><div style="font-size:11px;letter-spacing:2px;color:#8a8550;text-transform:uppercase">Construction Dashboard</div></td></tr><tr><td style="padding:0 24px"><div style="height:2px;line-height:2px;font-size:0;background:#515520">&nbsp;</div></td></tr><tr><td style="padding:24px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;margin:0 0 12px"><span style="color:#515520">Project closing:</span> <span style="color:#2f2f2f">${body.projectName || 'Project'}</span></div><p style="font-size:14px;color:#2f2f2f;line-height:1.6;margin:0 0 14px">This project will be archived on <strong>${when}</strong>. After that date it will no longer appear in your project list and you will not be able to access its records.</p><p style="font-size:14px;color:#2f2f2f;line-height:1.6;margin:0 0 14px">If you need copies of any documents, please download them before then.</p><div style="text-align:center;margin:22px 0 4px"><a href="${origin}" style="display:inline-block;background:#515520;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 30px;border-radius:6px">Open the Dashboard</a></div></td></tr><tr><td style="padding:14px 24px 22px;text-align:center;border-top:1px solid #f0ece3"><div style="font-size:11px;color:#b3b0a4;line-height:1.6">Sent from the Fidevia Construction Dashboard.</div></td></tr></table></div>`;
          await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SENDGRID_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: emails.map(e => ({ email: e })) }], from: { email: process.env.FROM_EMAIL || 'clymerllc@gmail.com', name: 'Fidevia Dashboard' }, subject: '[Fidevia] ' + (body.projectName || 'Project') + ' will be archived on ' + when, content: [{ type: 'text/html', value: html }] }) });
          sent = emails.length;
        }
      } catch (e) {}
      return json({ ok: true, notified: sent });
    }
    if (op === 'getArchived') {
      return json({ ids: await getArchivedIds() });
    }
    if (op === 'setArchived') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      let d = await getArchivedIds();
      const id = String(body.projectId || '');
      if (!id) return json({ error: 'projectId required' }, 400);
      if (body.archived) { if (!d.includes(id)) d.push(id); }
      else { d = d.filter(x => x !== id); }
      await archivedStore().setJSON('ids', d);
      return json({ ok: true });
    }

    if (op === 'deleteProject') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const pw = PANEL_PW();
      if (!pw || String(body.password || '') !== pw) return json({ error: 'Incorrect password' }, 403);
      const id = String(body.projectId || '');
      if (!id) return json({ error: 'projectId required' }, 400);
      const archived = await getArchivedIds();
      if (!archived.includes(id)) return json({ error: 'Project must be archived before it can be deleted.' }, 400);
      const r = await fetch(`https://api.box.com/2.0/folders/${id}?recursive=true`, { method: 'DELETE', headers: H });
      if (!r.ok && r.status !== 404) return json({ error: 'Delete failed ' + r.status }, r.status);
      await archivedStore().setJSON('ids', archived.filter(x => x !== id));
      return json({ ok: true });
    }

    return json({ error: 'Unknown or unpermitted op: ' + op }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/box-proxy' };
