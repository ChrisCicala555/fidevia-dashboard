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
  const isAdmin = (!!email && email.endsWith('@' + ADMIN_DOMAIN)) || admins.includes(email);
  return { sub: u.sub, email, name: u.name || u.given_name || '', isAdmin };
}

// --- Grants store: key = external email, value = { projects:[{id,name}] } ---
const grantsStore = () => getStore('access-grants');
const requestsStore = () => getStore('access-requests');
const notifStore = () => getStore('notif-templates');
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
  // TEMP one-time demo seeding. Gated by token. REMOVE after use.
  if (req.method === 'GET' && new URL(req.url).searchParams.get('seed') === 'fidevia-seed-7k2x') {
    try {
      const t = await serviceToken();
      const H = { Authorization: 'Bearer ' + t };
      const root = process.env.BOX_PROJECTS_ROOT_ID;
      const mk = async (name, parent) => {
        const r = await fetch('https://api.box.com/2.0/folders', { method:'POST', headers:{...H,'Content-Type':'application/json'}, body:JSON.stringify({name,parent:{id:String(parent)}}) });
        if (r.status === 409) { const lr=await fetch(`https://api.box.com/2.0/folders/${parent}/items?limit=1000&fields=id,name,type`,{headers:H}); const items=(await lr.json()).entries||[]; const f=items.find(i=>i.name===name&&i.type==='folder'); return f.id; }
        return (await r.json()).id;
      };
      const up = async (name, content, parent) => {
        const form=new FormData(); form.append('attributes',JSON.stringify({name,parent:{id:String(parent)}})); form.append('file',new Blob([new TextEncoder().encode(content)],{type:'text/csv'}),name);
        await fetch('https://upload.box.com/api/2.0/files/content',{method:'POST',headers:H,body:form});
      };
      const csv=(headers,rows)=>[headers.join(','),...rows.map(r=>headers.map(h=>csvEsc(r[h])).join(','))].join('\n')+'\n';
      const projId = await mk('Lincoln Elementary Modernization', root);
      const MOD = [
        { folder:'01 - RFIs', file:'RFI Log.csv',
          headers:['RFI #','Subject','Description','Submitted By','Assigned To','Date Submitted','Due Date','Date Closed','Status','Response Summary','Attachment File ID','Attachment Name'],
          rows:[
            {'RFI #':'RFI-001','Subject':'Ceiling grid height at Gymnasium','Description':'Confirm finished ceiling height at the main gym.','Submitted By':'Summit Builders','Assigned To':'Draper & Associates','Date Submitted':'2026-05-04','Due Date':'2026-05-11','Date Closed':'2026-05-09','Status':'Closed','Response Summary':'Height confirmed at 12 ft AFF.'},
            {'RFI #':'RFI-002','Subject':'Electrical panel location Room 104','Description':'Panel conflicts with planned casework on north wall.','Submitted By':'Summit Builders','Assigned To':'Draper & Associates','Date Submitted':'2026-05-18','Due Date':'2026-05-25','Status':'Open'},
            {'RFI #':'RFI-003','Subject':'Window flashing detail at sill','Description':'Flashing detail missing at classroom window sills.','Submitted By':'Apex Glazing','Assigned To':'Draper & Associates','Date Submitted':'2026-06-02','Due Date':'2026-06-09','Status':'Open'},
            {'RFI #':'RFI-004','Subject':'Fire-rated corridor door assembly','Description':'Verify required rating for corridor doors near stair 2.','Submitted By':'Summit Builders','Assigned To':'Fire Marshal','Date Submitted':'2026-05-28','Due Date':'2026-06-04','Date Closed':'2026-06-03','Status':'Closed','Response Summary':'90-minute rating confirmed.'}
          ]},
        { folder:'02 - Change Orders', file:'Change Order Log.csv',
          headers:['CO #','Description','Cost Impact','Schedule Impact (Days)','Status','Linked RFI','Date Submitted','Date Approved','Attachment File ID','Attachment Name'],
          rows:[
            {'CO #':'CO-001','Description':'Added structural bracing at gym roof','Cost Impact':'24500','Schedule Impact (Days)':'5','Status':'Approved','Linked RFI':'RFI-001','Date Submitted':'2026-05-12','Date Approved':'2026-05-20'},
            {'CO #':'CO-002','Description':'Upgrade HVAC controls to BACnet','Cost Impact':'18750','Schedule Impact (Days)':'3','Status':'Pending Review','Date Submitted':'2026-06-05'},
            {'CO #':'CO-003','Description':'Additional site drainage at play area','Cost Impact':'32000','Schedule Impact (Days)':'7','Status':'Open','Date Submitted':'2026-06-10'}
          ]},
        { folder:'03 - Submittals', file:'Submittals Log.csv',
          headers:['Submittal #','Spec Section','Description','Submitted By (Sub)','Reviewer','Date Submitted','Status','Attachment File ID','Attachment Name'],
          rows:[
            {'Submittal #':'SUB-001','Spec Section':'08 71 00','Description':'Door hardware schedule','Submitted By (Sub)':'Ace Hardware Supply','Reviewer':'Draper & Associates','Date Submitted':'2026-05-10','Status':'Approved'},
            {'Submittal #':'SUB-002','Spec Section':'23 09 00','Description':'HVAC control drawings','Submitted By (Sub)':'Comfort Systems','Reviewer':'MEP Engineer','Date Submitted':'2026-05-22','Status':'Under Review'},
            {'Submittal #':'SUB-003','Spec Section':'09 51 00','Description':'Acoustic ceiling tiles','Submitted By (Sub)':'Interior Finishes Co','Reviewer':'Draper & Associates','Date Submitted':'2026-06-01','Status':'Pending Review'}
          ]},
        { folder:'04 - Daily Logs', file:'Daily Log Index.csv',
          headers:['Date','Submitted By','Weather','Crew Count','Work Performed','Delays / Issues','Attachment File ID','Attachment Name'],
          rows:[
            {'Date':'2026-06-09','Submitted By':'M. Torres','Weather':'Sunny 78F','Crew Count':'14','Work Performed':'Poured gym slab; framing corridor B','Delays / Issues':'None'},
            {'Date':'2026-06-10','Submitted By':'M. Torres','Weather':'Cloudy 71F','Crew Count':'12','Work Performed':'Rough-in electrical Rooms 101-105','Delays / Issues':'Late material delivery 2 hrs'},
            {'Date':'2026-06-11','Submitted By':'M. Torres','Weather':'Rain 65F','Crew Count':'8','Work Performed':'Interior drywall hanging','Delays / Issues':'Rain halted exterior work'}
          ]},
        { folder:'05 - Contacts', file:'Job Contacts.csv',
          headers:['Name','Company','Role','Email','Phone','Notify - RFI','Notify - CO','Notify - Submittal'],
          rows:[
            {'Name':'David Chen','Company':'Summit Builders','Role':'Project Manager','Email':'dchen@example.com','Phone':'(503) 555-0142','Notify - RFI':'Yes','Notify - CO':'Yes','Notify - Submittal':'Yes'},
            {'Name':'Sarah Draper','Company':'Draper & Associates','Role':'Architect','Email':'sdraper@example.com','Phone':'(503) 555-0177','Notify - RFI':'Yes','Notify - CO':'No','Notify - Submittal':'Yes'},
            {'Name':'Miguel Torres','Company':'Summit Builders','Role':'Superintendent','Email':'mtorres@example.com','Phone':'(503) 555-0188','Notify - RFI':'No','Notify - CO':'No','Notify - Submittal':'No'},
            {'Name':'Lincoln SD Facilities','Company':'Lincoln School District','Role':'Owner Representative','Email':'facilities@example.com','Phone':'(503) 555-0100','Notify - RFI':'Yes','Notify - CO':'Yes','Notify - Submittal':'No'}
          ]},
        { folder:'06 - Budget', file:'Budget Tracker.csv',
          headers:['Cost Code','Description','Budget Amount','Committed Costs','Approved Change Orders','Actual to Date','Variance'],
          rows:[
            {'Cost Code':'03 30 00','Description':'Cast-in-place concrete','Budget Amount':'420000','Committed Costs':'410000','Approved Change Orders':'24500','Actual to Date':'398000','Variance':'22000'},
            {'Cost Code':'09 51 00','Description':'Acoustical ceilings','Budget Amount':'85000','Committed Costs':'82000','Approved Change Orders':'0','Actual to Date':'41000','Variance':'3000'},
            {'Cost Code':'23 00 00','Description':'HVAC','Budget Amount':'610000','Committed Costs':'625000','Approved Change Orders':'18750','Actual to Date':'300000','Variance':'-33750'},
            {'Cost Code':'26 00 00','Description':'Electrical','Budget Amount':'480000','Committed Costs':'470000','Approved Change Orders':'0','Actual to Date':'210000','Variance':'10000'}
          ]},
        { folder:'07 - Documents', file:'Document Index.csv',
          headers:['Document Name','Category','Version','Date','Visible To','File ID','File Name'],
          rows:[
            {'Document Name':'Architectural Set','Category':'Drawings','Version':'3','Date':'2026-05-01','Visible To':'Internal + Prime'},
            {'Document Name':'Structural Calculations','Category':'Engineering','Version':'1','Date':'2026-04-20','Visible To':'Internal Only'},
            {'Document Name':'Project Schedule','Category':'Schedule','Version':'2','Date':'2026-06-01','Visible To':'Internal + Prime'}
          ]},
        { folder:'08 - Internal', file:'Comments.csv',
          headers:['Date','Author','Role','Comment','Parent ID'],
          rows:[
            {'Date':'2026-06-05 09:12','Author':'David Chen','Role':'Internal','Comment':'Owner walkthrough scheduled for 6/20.'},
            {'Date':'2026-06-08 14:30','Author':'Sarah Draper','Role':'Internal','Comment':'Need CO-002 resolved before controls install.'}
          ]},
        { folder:'09 - Payment Applications', file:'Payment Applications.csv',
          headers:['App #','Contractor','Company','Period From','Period To','Contract Amount','Previously Paid','Requested Amount','Remaining on Contract','Status','Reviewed By','Review Date','Attachment File ID','Attachment Name'],
          rows:[
            {'App #':'PA-001','Contractor':'David Chen','Company':'Summit Builders','Period From':'2026-05-01','Period To':'2026-05-31','Contract Amount':'2100000','Previously Paid':'0','Requested Amount':'315000','Remaining on Contract':'1785000','Status':'Approved','Reviewed By':'Fidevia PM','Review Date':'2026-06-05'},
            {'App #':'PA-002','Contractor':'David Chen','Company':'Summit Builders','Period From':'2026-06-01','Period To':'2026-06-30','Contract Amount':'2100000','Previously Paid':'315000','Requested Amount':'428000','Remaining on Contract':'1357000','Status':'Pending'}
          ]}
      ];
      for (const m of MOD) { const fid = await mk(m.folder, projId); await up(m.file, csv(m.headers, m.rows), fid); }
      return json({ ok:true, projectId:projId, modules:MOD.length });
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
