import { getStore } from '@netlify/blobs';

const AUTH0_DOMAIN = 'dev-477eis4yqjwd6d4g.us.auth0.com';
const ADMIN_DOMAIN = 'fidevia.com';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const csvEsc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

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
  // TEMP v2 seeding for Lincoln. Gated. REMOVE after use.
  if (req.method === 'GET' && new URL(req.url).searchParams.get('seed2') === 'fidevia-v2-3q7') {
    try {
      const t = await serviceToken();
      const H = { Authorization: 'Bearer ' + t };
      const root = process.env.BOX_PROJECTS_ROOT_ID;
      const lr = await fetch(`https://api.box.com/2.0/folders/${root}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = (await lr.json()).entries || [];
      const proj = items.find(i => i.type === 'folder' && i.name === 'Lincoln Elementary Modernization');
      if (!proj) return json({ ok:false, error:'Lincoln project not found' });
      const projId = proj.id;
      const mk = async (name, parent) => {
        const r = await fetch('https://api.box.com/2.0/folders', { method:'POST', headers:{...H,'Content-Type':'application/json'}, body:JSON.stringify({name,parent:{id:String(parent)}}) });
        if (r.status === 409) { const l=await fetch(`https://api.box.com/2.0/folders/${parent}/items?limit=1000&fields=id,name,type`,{headers:H}); const its=(await l.json()).entries||[]; const f=its.find(i=>i.name===name&&i.type==='folder'); return f.id; }
        return (await r.json()).id;
      };
      const putFile = async (name, content, parent) => {
        const l = await fetch(`https://api.box.com/2.0/folders/${parent}/items?limit=1000&fields=id,name,type`, { headers: H });
        const its = (await l.json()).entries || [];
        const ex = its.find(i => i.type==='file' && i.name===name);
        const form = new FormData();
        form.append('attributes', JSON.stringify(ex ? {name} : {name, parent:{id:String(parent)}}));
        form.append('file', new Blob([new TextEncoder().encode(content)], {type:'text/plain'}), name);
        const url = ex ? `https://upload.box.com/api/2.0/files/${ex.id}/content` : 'https://upload.box.com/api/2.0/files/content';
        await fetch(url, { method:'POST', headers:H, body:form });
      };
      const csv = (headers, rows) => [headers.join(','), ...rows.map(r=>headers.map(h=>csvEsc(r[h])).join(','))].join('\n')+'\n';

      // 1. Project Info.json (config)
      const config = {
        owner:'Lincoln School District', location:'Lincoln, PA', jobNumber:'25-114', onsiteCM:'Andre Martin',
        scope:'Modernization and additions to Lincoln Elementary School.', logoFileId:'', boardReportsEnabled:true,
        milestones:[
          {name:'Notice to Proceed', baseline:'2025-01-15', contract:'2025-01-10', current:'2025-01-15'},
          {name:'Mobilize / Start Onsite', baseline:'2025-02-01', contract:'2025-01-27', current:'2025-02-03'},
          {name:'Substantial Completion', baseline:'2026-08-15', contract:'2026-09-25', current:'2026-10-05'},
          {name:'Punchlist', baseline:'2026-09-15', contract:'2026-10-23', current:'2026-10-23'},
          {name:'Final Completion', baseline:'2026-10-15', contract:'2026-11-20', current:'2026-11-20'}
        ],
        contractors:[
          {role:'GC', name:'Summit Builders', contract:12000000, active:true},
          {role:'MC', name:'Comfort Systems', contract:4500000, active:true},
          {role:'PC', name:'AH Plumbing', contract:1800000, active:true},
          {role:'EC', name:'Voltage Electric', contract:3200000, active:true}
        ]
      };
      await putFile('Project Info.json', JSON.stringify(config, null, 2), projId);

      // 2. Payment Applications (overwrite with per-contractor latest apps)
      const payFolder = items.length ? null : null; // find below
      const pl = await fetch(`https://api.box.com/2.0/folders/${projId}/items?limit=1000&fields=id,name,type`, { headers: H });
      const pits = (await pl.json()).entries || [];
      const payF = pits.find(i => i.type==='folder' && /^09/.test(i.name));
      const payHeaders = ['App #','Contractor','Company','Period From','Period To','Contract Amount','Approved Change Orders','Previously Paid','Requested Amount','Remaining on Contract','Status','Reviewed By','Review Date','Attachment File ID','Attachment Name'];
      const pa = (num,contr,co,contract,coAmt,prev,req,status)=>({'App #':num,'Contractor':contr,'Company':contr,'Period From':'2026-06-01','Period To':'2026-06-30','Contract Amount':String(contract),'Approved Change Orders':String(coAmt),'Previously Paid':String(prev),'Requested Amount':String(req),'Remaining on Contract':String((contract+coAmt)-prev-req),'Status':status,'Reviewed By':'Fidevia PM','Review Date':'2026-07-05','Attachment File ID':'','Attachment Name':''});
      const payRows = [
        pa('PA-007','Summit Builders','',12000000,480000,9200000,850000,'Approved'),
        pa('PA-005','Comfort Systems','',4500000,120000,3600000,310000,'Approved'),
        pa('PA-006','AH Plumbing','',1800000,65000,1400000,120000,'Pending'),
        pa('PA-006','Voltage Electric','',3200000,210000,2500000,260000,'Approved')
      ];
      if (payF) await putFile('Payment Applications.csv', csv(payHeaders, payRows), payF.id);

      // 3. Meeting Minutes folder + csv
      const mmId = await mk('10 - Meeting Minutes', projId);
      await putFile('Meeting Minutes.csv', csv(['Date','Meeting Type','Attendees','Summary','Attachment File ID','Attachment Name'], [
        {'Date':'2026-07-08','Meeting Type':'OAC Meeting','Attendees':'Owner, Architect, GC','Summary':'Reviewed submittal log and upcoming inspections.'},
        {'Date':'2026-06-24','Meeting Type':'Job Conference','Attendees':'GC, Subs, CM','Summary':'Coordinated MEP rough-in sequencing for east wing.'},
        {'Date':'2026-06-10','Meeting Type':'OAC Meeting','Attendees':'Owner, Architect, CM','Summary':'Discussed CO-002 controls upgrade and schedule impact.'}
      ]), mmId);

      // 4. Board Reports folder + csv
      const brId = await mk('11 - Board Reports', projId);
      await putFile('Board Reports.csv', csv(['Date','Title','Summary','Attachment File ID','Attachment Name'], [
        {'Date':'2026-07-01','Title':'June Board Report','Summary':'Project ~80% billed and on track for fall substantial completion.'},
        {'Date':'2026-06-01','Title':'May Board Report','Summary':'Structural work complete; MEP rough-in underway across all wings.'}
      ]), brId);

      return json({ ok:true, projId });
    } catch(e) { return json({ ok:false, error:e.message }); }
  }
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
        return json({ projects: (d.entries || []).filter(e => e.type === 'folder').map(e => ({ id: e.id, name: e.name })) });
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
        const store = grantsStore();
        const g = (await store.get(email, { type: 'json' })) || { projects: [] };
        if (!g.projects.some(p => String(p.id) === String(body.projectId))) g.projects.push({ id: String(body.projectId), name: body.projectName || '' });
        await store.setJSON(email, g);
        try { await addContactToProject(H, String(body.projectId), contactFromSnap(null, email)); } catch(e) {}
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
      return json({ projects: (d.entries || []).filter(e => e.type === 'folder').map(e => ({ id: e.id, name: e.name })) });
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
      const existing = new Map((d.entries || []).filter(e => e.type === 'folder').map(e => [String(e.id), e.name]));
      const mine = grants.filter(g => existing.has(String(g.id))).map(g => ({ id: g.id, name: existing.get(String(g.id)) || g.name }));
      return json({ projects: mine });
    }

    // ---- DATA OPS: enforce grant scope for non-admins ----
    const grantedIds = who.isAdmin ? null : new Set((await getGrants(who.email)).map(p => String(p.id)));
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
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}/content`, { headers: H });
      return json({ text: r.ok ? await r.text() : '' });
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
    if (op === 'appendRow') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const { folderId, filename, headers, row } = body;
      if (!Array.isArray(headers) || typeof row !== 'object') return json({ error: 'headers[] and row{} required' }, 400);
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

    return json({ error: 'Unknown or unpermitted op: ' + op }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: '/api/box-proxy' };
