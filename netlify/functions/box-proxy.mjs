import { getStore } from '@netlify/blobs';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH0_DOMAIN = 'login.fidevia.com';
const AUTH0_DOMAIN_FALLBACK = 'dev-477eis4yqjwd6d4g.us.auth0.com';
let LAST_AUTH_DIAG = '';
let LAST_AUTH_RATELIMITED = false;
// Cache userinfo per token so a burst of parallel requests doesn't hammer (and get
// rate-limited by) Auth0's /userinfo endpoint. Survives across warm invocations.
// folderId|filename -> fileId. Halves the Box calls per project load by
// skipping the folder listing needed to resolve a CSV's file ID. All dashboard
// traffic now shares ONE service-account rate limit (1000 req/min), so this
// matters more than it did when each user had their own budget.
// projectId -> logoFileId, so the project picker can show each project's logo
// without re-reading every Project Info.json on each visit.
const _logoCache = new Map();
const LOGO_TTL = 10 * 60 * 1000;
async function logoIdFor(H, projectId){
  const k=String(projectId);
  const hit=_logoCache.get(k);
  if(hit && Date.now()<hit.exp) return hit.id;
  let id='';
  try{
    const r=await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(k)}/items?limit=1000&fields=id,name,type`, { headers: H });
    const items=r.ok?((await r.json()).entries||[]):[];
    const cfgFile=items.find(e=>e.type==='file'&&e.name==='Project Info.json');
    if(cfgFile){
      const cr=await boxFetch(`https://api.box.com/2.0/files/${cfgFile.id}/content`, { headers: H });
      if(cr.ok){ const cfg=JSON.parse(await cr.text())||{}; id=String(cfg.logoFileId||''); }
    }
  }catch(e){}
  if(_logoCache.size>500) _logoCache.clear();
  _logoCache.set(k,{id, exp:Date.now()+LOGO_TTL});
  return id;
}

const _fidCache = new Map();
const FID_TTL = 10 * 60 * 1000;
function _fidGet(k){ const e=_fidCache.get(k); if(e && Date.now()<e.exp) return e.id; if(e) _fidCache.delete(k); return null; }
function _fidSet(k,id){ if(_fidCache.size>2000) _fidCache.clear(); _fidCache.set(k,{id,exp:Date.now()+FID_TTL}); }

const _uiCache = new Map();
const UI_TTL = 5 * 60 * 1000;
function _uiGet(tok){ const e = _uiCache.get(tok); if (e && Date.now() < e.exp) return e.user; if (e) _uiCache.delete(tok); return null; }
function _uiSet(tok, user){ if (_uiCache.size > 500) _uiCache.clear(); _uiCache.set(tok, { user, exp: Date.now() + UI_TTL }); }
async function auth0Userinfo(auth){
  const tok = String(auth || '').slice(7);
  if (!tok) { LAST_AUTH_DIAG = 'no token'; return null; }
  const cached = _uiGet(tok);
  if (cached) return cached;
  const diag = [];
  let sawRateLimit = false, sawHardFail = false;
  for (const d of [AUTH0_DOMAIN, AUTH0_DOMAIN_FALLBACK]) {
    try {
      const r = await fetch(`https://${d}/userinfo`, { headers: { Authorization: auth } });
      diag.push(d.split('.')[0] + ':' + r.status);
      if (r.ok) { const u = await r.json(); _uiSet(tok, u); LAST_AUTH_DIAG = ''; LAST_AUTH_RATELIMITED = false; return u; }
      if (r.status === 429) sawRateLimit = true;
      else if (r.status === 401 || r.status === 403) sawHardFail = true;
    } catch (e) { diag.push(d.split('.')[0] + ':err'); }
  }
  LAST_AUTH_DIAG = diag.join(' ');
  LAST_AUTH_RATELIMITED = sawRateLimit && !sawHardFail;
  return null;
}
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
  const r = await boxFetch('https://api.box.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json();
  if (!d.access_token) throw new Error('Service auth failed');
  _svc = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return _svc.token;
}

// --- Identify the caller from their Auth0 token ---
// ── BOX REQUESTS WITH BACKOFF ──
// Box returns 429 when the enterprise exceeds ~1000 calls/min (240 for uploads),
// and every chunk of a chunked upload counts. Without this a burst surfaces as a
// failed upload or a half-written record: file in Box, CSV never updated.
// Retries honour Retry-After, add jitter so parallel callers do not resynchronise,
// and give up after a few attempts so nothing hangs indefinitely.
let RATE_LIMIT_HITS = 0;
const _sleep = ms => new Promise(r => setTimeout(r, ms));
async function boxFetch(url, opts, tries = 4) {
  const method = ((opts && opts.method) || 'GET').toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD';
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      lastErr = e;
      if (i === tries - 1) throw e;
      await _sleep(Math.min(400 * Math.pow(2, i), 6000) + Math.random() * 250);
      continue;
    }
    // 429 means Box rejected the call outright, so replaying it is always safe.
    // 5xx is ambiguous for writes (it may have applied), so only retry reads.
    const retryable = r.status === 429 || (idempotent && r.status >= 500 && r.status < 600);
    if (!retryable || i === tries - 1) return r;
    const ra = parseFloat(r.headers.get('Retry-After') || '');
    const wait = Number.isFinite(ra) && ra > 0
      ? Math.min(ra * 1000, 10000)
      : Math.min(500 * Math.pow(2, i), 8000);
    RATE_LIMIT_HITS++;
    await _sleep(wait + Math.random() * 250);
  }
  if (lastErr) throw lastErr;
}

// ── LOCAL TOKEN VERIFICATION (JWKS) ──
// Auth0 rate-limits /userinfo to roughly 10 calls per minute PER USER, which a
// single project load can exhaust on its own. Verifying the ID token's RS256
// signature against Auth0's published keys is local CPU work: no network call,
// no rate limit, and a stronger guarantee than trusting an HTTP response.
// Keys are fetched once per container and cached by jose.
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || 'LkuCVdAYFVpDljYze05RL1OCY3aCboxB';
const _jwks = {};
function jwksFor(domain){
  if (!_jwks[domain]) _jwks[domain] = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`), { cacheMaxAge: 12 * 60 * 60 * 1000 });
  return _jwks[domain];
}
async function verifyIdToken(idToken){
  if (!idToken) return null;
  for (const d of [AUTH0_DOMAIN, AUTH0_DOMAIN_FALLBACK]) {
    try {
      const { payload } = await jwtVerify(idToken, jwksFor(d), {
        issuer: `https://${d}/`,
        audience: AUTH0_CLIENT_ID,
        clockTolerance: 60
      });
      if (payload && payload.email) return payload;
    } catch (e) { /* try the other issuer */ }
  }
  return null;
}

let LAST_AUTH_VIA = '';
async function caller(req) {
  const auth = req.headers.get('authorization') || '';
  // Fast path: verify the ID token locally. Falls back to /userinfo so older
  // clients (and anything the verification cannot handle) keep working.
  const idTok = req.headers.get('x-id-token') || '';
  let u = await verifyIdToken(idTok);
  LAST_AUTH_VIA = u ? 'jwks' : (idTok ? 'jwks-failed' : 'no-id-token');
  if (!u) {
    if (!auth.startsWith('Bearer ')) return null;
    u = await auth0Userinfo(auth);
    if (u) LAST_AUTH_VIA += '+userinfo';
  }
  if (!u) return null;
  const email = (u.email || '').toLowerCase();
  // Admin is granted purely on the email domain, so an UNVERIFIED address is a
  // free pass to every project. Anyone able to sign up as someone@fidevia.com
  // without proving they control the mailbox would be a full administrator.
  // The same applies to external users: grants are keyed to an email address.
  // Distinguish "Auth0 says this address is unverified" from "the token does not
  // carry the claim at all". Treating a missing claim as unverified locks out
  // every account, which is exactly what happened on the first attempt.
  const _ev = u.email_verified;
  const verificationKnown = (_ev !== undefined && _ev !== null);
  const emailVerified = (_ev === true || _ev === 'true');
  const admins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const blobAdmins = await getBlobAdmins();
  // Admin no longer hinges on verification while that signal is unproven —
  // gating it locked real accounts out. Re-enable via REQUIRE_VERIFIED_EMAIL
  // once we have confirmed what Auth0 actually reports.
  const isAdmin = (!!email && email.endsWith('@' + ADMIN_DOMAIN)) || admins.includes(email) || blobAdmins.includes(email);
  return { sub: u.sub, email, name: u.name || u.given_name || '', isAdmin, emailVerified, verificationKnown };
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
  const lr = await boxFetch(`https://api.box.com/2.0/folders/${projectId}/items?limit=1000&fields=id,name,type`, { headers: H });
  const items = lr.ok ? ((await lr.json()).entries || []) : [];
  const cf = items.find(i => i.type === 'folder' && /^0?5\b|^05/.test(i.name) || (i.type==='folder' && i.name.toLowerCase().includes('contact')));
  if (!cf) return;
  const flr = await boxFetch(`https://api.box.com/2.0/folders/${cf.id}/items?limit=1000&fields=id,name,type`, { headers: H });
  const fitems = flr.ok ? ((await flr.json()).entries || []) : [];
  const existing = fitems.find(i => i.type === 'file' && i.name === fname);
  let current = '';
  if (existing) { const cr = await boxFetch(`https://api.box.com/2.0/files/${existing.id}/content`, { headers: H }); current = cr.ok ? await cr.text() : ''; }
  if (current && contact.Email && current.toLowerCase().includes(String(contact.Email).toLowerCase())) return; // already a contact
  const rowLine = CH.map(h => csvEsc(contact[h])).join(',');
  let out, url, attrs;
  if (existing) { out = current.replace(/\s*$/, '') + '\n' + rowLine + '\n'; url = `https://upload.box.com/api/2.0/files/${existing.id}/content`; attrs = JSON.stringify({ name: fname }); }
  else { out = CH.join(',') + '\n' + rowLine + '\n'; url = 'https://upload.box.com/api/2.0/files/content'; attrs = JSON.stringify({ name: fname, parent: { id: String(cf.id) } }); }
  const form = new FormData(); form.append('attributes', attrs); form.append('file', new Blob([new TextEncoder().encode(out)], { type: 'text/csv' }), fname);
  await boxFetch(url, { method: 'POST', headers: H, body: form });
}
function contactFromSnap(snap, email){
  return { 'Name': (snap && snap.name) || '', 'Company': (snap && snap.company) || '', 'Role': (snap && snap.role) || '', 'Email': email, 'Phone': (snap && snap.phone) || '', 'Notify - RFI':'Yes','Notify - CO':'Yes','Notify - Submittal':'Yes' };
}
async function sendGrantEmail(email, projectName, company, role){
  return sendGrantEmailMany(email, [projectName], company, role);
}
async function sendGrantEmailMany(email, projectNames, company, role){
  const key = process.env.SENDGRID_KEY; if(!key || !email) return;
  const from = process.env.FROM_EMAIL || 'dashboard@fidevia.com';
  const origin = (process.env.SITE_URL || 'https://dashboard.fidevia.com').replace(/\/$/,'');
  const esc = s => String(s == null ? '' : s).replace(/</g, '&lt;');
  const names = (projectNames || []).map(n => String(n || '').trim()).filter(Boolean);
  const multi = names.length > 1;
  const projectName = names[0] || '';
  const proj = multi ? esc(names.length + ' projects') : esc(projectName || 'a project');
  const serif = "Georgia,'Times New Roman',Times,serif";
  const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const rows = [[multi ? 'Projects' : 'Project', multi ? names.map(esc).join('<br>') : proj], ['Your Sign-in Email', esc(email)]];
  if (company) rows.push(['Company', esc(company)]);
  if (role) rows.push(['Role', esc(role)]);
  const rowsHTML = rows.map(([k, v], i) => `<tr style="background:${i % 2 ? '#ffffff' : '#faf9f6'}"><td style="padding:10px 16px;color:#7a7a70;font-size:13px;font-family:${sans};width:170px;border-bottom:1px solid #ece8df">${k}</td><td style="padding:10px 16px;font-size:14px;font-weight:600;color:#2f2f2f;font-family:${sans};border-bottom:1px solid #ece8df">${v}</td></tr>`).join('');
  const html = `<div style="background:#f4f2ec;padding:28px 16px;font-family:${sans}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2ddd5;border-radius:12px;overflow:hidden">
    <tr><td style="padding:26px 24px 12px;text-align:center;background:#ffffff">
      <img src="${origin}/fidevia-email-logo.png" alt="Fidevia" width="164" style="display:block;margin:0 auto 6px;max-width:164px;height:auto">
      <div style="font-family:${sans};font-size:11px;letter-spacing:2px;color:#8a8550;text-transform:uppercase">Construction Dashboard</div></td></tr>
    <tr><td style="padding:0 24px"><div style="height:2px;line-height:2px;font-size:0;background:#515520;">&nbsp;</div></td></tr>
    <tr><td style="padding:22px 24px 6px">
      <div style="font-family:${serif};font-size:20px;font-weight:700;margin:0 0 4px"><span style="color:#515520">Access granted:</span> <span style="color:#2f2f2f">${proj}</span></div>
      <div style="font-family:${sans};font-size:12px;color:#9a988c;text-transform:uppercase;letter-spacing:.6px;margin:0 0 16px">Fidevia Construction Dashboard</div>
      <p style="font-size:14px;color:#2f2f2f;line-height:1.6;margin:0 0 14px">You now have access to ${multi ? 'these projects' : 'this project'}. Sign in with your account &mdash; or create one using this same email address if you haven't yet.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ece8df;border-radius:8px;overflow:hidden">${rowsHTML}</table>
      <div style="text-align:center;margin:22px 0 4px"><a href="${origin}/" style="display:inline-block;background:#515520;color:#ffffff;text-decoration:none;font-family:${sans};font-size:13px;font-weight:600;padding:11px 26px;border-radius:6px">Open in Dashboard</a></div>
      <p style="font-size:12px;color:#9a988c;line-height:1.6;margin:14px 0 0">If the button doesn't work, copy and paste this link: ${origin}/</p>
    </td></tr>
    <tr><td style="padding:14px 24px 22px;text-align:center;border-top:1px solid #f0ece3">
      <div style="font-family:${sans};font-size:11px;color:#b3b0a4;line-height:1.6">Sent automatically by the Fidevia Construction Dashboard.<br>Fidevia &middot; Construction Management &amp; Consulting</div></td></tr>
    </table></div>`;
  const payload = { personalizations:[{to:[{email}]}], from:{email:from,name:'Fidevia Dashboard'}, subject:'[Fidevia] You have access to ' + (multi ? (names.length + ' projects') : (projectName || 'a project')), content:[{type:'text/html',value:html}] };
  await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
const reqKey = (projectId, email) => `${projectId}__${email}`;
async function getGrants(email) { const g = await grantsStore().get(email, { type: 'json' }); return (g && g.projects) ? g.projects : []; }
const PRIVATE_CSV = { 'Payment Applications.csv': 'Contractor', 'Contractor Daily Reports.csv': 'Company', 'Certified Payrolls.csv': 'Company' };

// ── PROJECT ROLES ──
// Roles are per grant, not per account: the same person can be a contractor on
// one project and an architect on another. Fidevia staff are internal by email
// domain and are not granted a role here.
const ROLE_CONTRACTOR = 'contractor';
const ROLE_AE         = 'architect-engineer';
const ROLE_OWNER      = 'owner';
const VALID_ROLES = [ROLE_CONTRACTOR, ROLE_AE, ROLE_OWNER];
function normRole(r){
  const t = String(r || '').trim().toLowerCase();
  if (VALID_ROLES.includes(t)) return t;
  // Tolerate the free-text values written before roles were functional.
  if (/architect|engineer|a\/e|consultant/.test(t)) return ROLE_AE;
  if (/owner|client/.test(t)) return ROLE_OWNER;
  return ROLE_CONTRACTOR;   // safest default: sees only its own company
}
// Architect/Engineer and Owner review the whole project, so company-private
// modules are NOT filtered down to one company for them.
function seesAllCompanies(role){ return role === ROLE_AE || role === ROLE_OWNER; }
// Owner is strictly read-only.
function roleMayWrite(role){ return role !== ROLE_OWNER; }
// Which logs an external caller may read, by role. This is an ALLOWLIST on
// purpose. The previous denylist named the files to withhold, which meant any
// file it did not name — the budget, the internal message board, the audit log,
// a module added next month — was served in full to anyone holding a project
// grant. Naming what is permitted instead makes the default private.
//
// The rule for editing this: a file belongs here only if the interface already
// offers that module to that role. Adding a module to the UI without adding it
// here fails closed, which is the direction we want to fail in.
const EXTERNAL_READABLE_CSV = {
  'RFI Log.csv':                  [ROLE_CONTRACTOR, ROLE_AE],
  'Change Order Log.csv':         [ROLE_CONTRACTOR, ROLE_AE, ROLE_OWNER],
  'Submittals Log.csv':           [ROLE_CONTRACTOR, ROLE_AE],
  'Document Index.csv':           [ROLE_CONTRACTOR, ROLE_AE],
  'Documents.csv':                [ROLE_CONTRACTOR, ROLE_AE],
  'Job Contacts.csv':             [ROLE_CONTRACTOR, ROLE_AE, ROLE_OWNER],
  // OAC minutes: the architect and the owner are in the room, the trades are not.
  'Meeting Minutes.csv':          [ROLE_AE, ROLE_OWNER],
  'Payment Applications.csv':     [ROLE_CONTRACTOR, ROLE_AE, ROLE_OWNER],
  'Contractor Daily Reports.csv': [ROLE_CONTRACTOR, ROLE_AE],
  'Certified Payrolls.csv':       [ROLE_CONTRACTOR, ROLE_AE]
};
// Never reaches an external caller in any role: Budget Tracker.csv,
// Comments.csv (internal message board), Daily Log Index.csv (Fidevia's own
// daily reports), Meeting Minutes.csv, Board Reports.csv, Audit Log.csv.
// These are absent from the map above rather than listed, by design.
// Documents carry a per-row "Visible To" setting. This was only ever enforced in
// the browser, so external users received internal-only rows (and their file IDs)
// in the payload and simply did not see them rendered.
const VISIBILITY_CSV = { 'Document Index.csv': 'Visible To', 'Documents.csv': 'Visible To' };
function rowVisibleToExternal(v) {
  const t = String(v || '').toLowerCase();
  return t.includes('external') || t.includes('prime');
}
// Every column that can hold a Box file id, including inside version history.
function fileIdsInRow(row) {
  const out = [];
  for (const k of ['Attachment File ID', 'File ID', 'Signed File ID']) {
    const v = String(row[k] || '').trim(); if (v) out.push(v);
  }
  const vh = String(row['Version History'] || '');
  for (const m of vh.matchAll(/\b(\d{6,})\b/g)) out.push(m[1]);
  return out;
}
const SYSTEM_FOLDERS = ['Contact Directory Snapshots'];
// The project configuration is JSON, not CSV, so it slipped past the CSV rules
// entirely and was served whole to every external caller on every project open.
// It carries each contractor's contract value and allowance — exactly what the
// company-private logs exist to keep apart.
function filterProjectConfig(text, company, role) {
  let cfg; try { cfg = JSON.parse(text || '{}'); } catch (e) { return '{}'; }
  // Architect/Engineer and Owner review the project as a whole and legitimately
  // see every contractor's numbers elsewhere, so the config is left intact.
  if (role !== ROLE_CONTRACTOR) return JSON.stringify(cfg);
  const mine = String(company || '').trim().toLowerCase();
  const isMine = n => String(n || '').trim().toLowerCase() === mine && mine !== '';
  if (Array.isArray(cfg.contractors)) {
    // Names stay: the interface needs them for labels and pickers. Money does not.
    cfg.contractors = cfg.contractors.map(c => isMine(c && c.name)
      ? c
      : { name: (c && c.name) || '', active: !(c && c.active === false) });
  }
  if (cfg.workflowsByCompany && typeof cfg.workflowsByCompany === 'object') {
    const kept = {};
    for (const k of Object.keys(cfg.workflowsByCompany)) if (isMine(k)) kept[k] = cfg.workflowsByCompany[k];
    cfg.workflowsByCompany = kept;
  }
  return JSON.stringify(cfg);
}

// Apply the same row-level rules everywhere a file is handed to a caller.
function filterCsvForCaller(filename, text, isAdmin, company, role) {
  if (isAdmin) return text;
  const r0 = normRole(role);

  if (filename === 'Project Info.json') return filterProjectConfig(text, company, r0);

  // Anything that is not a log we recognise is withheld. Returning the header
  // row keeps the client's parser happy while carrying no records.
  if (!/\.csv$/i.test(String(filename || ''))) return '';
  const allowedRoles = EXTERNAL_READABLE_CSV[filename];
  if (!allowedRoles || !allowedRoles.includes(r0)) {
    return toCSVServer(parseCSVServer(text).headers, []);
  }

  const priv = PRIVATE_CSV[filename];
  const vis = VISIBILITY_CSV[filename];
  if (!priv && !vis) return text;
  const parsed = parseCSVServer(text);
  let rows = parsed.rows;

  // Contractors see only their own rows. Architect/Engineer and Owner review
  // the whole project, so the company filter does not apply to them.
  if (priv && !seesAllCompanies(r0)) {
    const c = String(company || '').trim().toLowerCase();
    rows = c ? rows.filter(x => String(x[priv] || '').trim().toLowerCase() === c) : [];
  }
  if (vis) rows = rows.filter(x => rowVisibleToExternal(x[vis]));
  return toCSVServer(parsed.headers, rows);
}

// The grant that covers this folder/file, so we can read both company and role.
async function grantFor(t, grants, kind, id) {
  const gidset = new Set(grants.map(g => String(g.id)));
  let pid = null;
  if (gidset.has(String(id))) pid = String(id);
  else {
    const path = kind === 'folder' ? `folders/${id}?fields=path_collection` : `files/${id}?fields=path_collection`;
    const r = await boxFetch('https://api.box.com/2.0/' + path, { headers: { Authorization: 'Bearer ' + t } });
    if (r.ok) { const d = await r.json(); const ids = ((d.path_collection && d.path_collection.entries) || []).map(e => String(e.id)); pid = ids.find(x => gidset.has(x)); }
  }
  return grants.find(x => String(x.id) === String(pid)) || null;
}

async function callerCompanyFor(t, grants, kind, id) {
  const gidset = new Set(grants.map(g => String(g.id)));
  let pid = null;
  if (gidset.has(String(id))) pid = String(id);
  else {
    const path = kind === 'folder' ? `folders/${id}?fields=path_collection` : `files/${id}?fields=path_collection`;
    const r = await boxFetch('https://api.box.com/2.0/' + path, { headers: { Authorization: 'Bearer ' + t } });
    if (r.ok) { const d = await r.json(); const ids = ((d.path_collection && d.path_collection.entries) || []).map(e => String(e.id)); pid = ids.find(x => gidset.has(x)); }
  }
  const g = grants.find(x => String(x.id) === String(pid));
  return g ? (g.company || '') : '';
}

// --- Verify a folder/file lives inside one of the granted project folders ---
async function withinGranted(t, grantedIds, kind, id) {
  if (grantedIds.has(String(id))) return true;
  const path = kind === 'folder' ? `folders/${id}?fields=path_collection` : `files/${id}?fields=path_collection`;
  const r = await boxFetch('https://api.box.com/2.0/' + path, { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) return false;
  const d = await r.json();
  const ids = ((d.path_collection && d.path_collection.entries) || []).map(e => String(e.id));
  return ids.some(x => grantedIds.has(x));
}


// Collect every file id referenced by rows this caller is permitted to see in a
// project, applying the same company and visibility filters as the CSV reads.
const _allowCache = new Map();
const ALLOW_TTL = 60 * 1000;
async function allowedFileIds(H, t, grants, who, projectId) {
  const key = (who.email || '') + '|' + projectId;
  const hit = _allowCache.get(key);
  if (hit && Date.now() < hit.exp) return hit.set;

  const ids = new Set();
  try {
    const fr = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(projectId)}/items?limit=1000&fields=id,name,type`, { headers: H });
    const folders = fr.ok ? ((await fr.json()).entries || []).filter(e => e.type === 'folder') : [];
    const _g = await grantFor(t, grants, 'folder', projectId);
    const company = (_g && _g.company) || '';
    const role = normRole(_g && _g.role);
    await Promise.all(folders.map(async f => {
      const lr = await boxFetch(`https://api.box.com/2.0/folders/${f.id}/items?limit=1000&fields=id,name,type`, { headers: H });
      const files = lr.ok ? ((await lr.json()).entries || []).filter(e => e.type === 'file' && e.name.endsWith('.csv')) : [];
      await Promise.all(files.map(async csv => {
        const cr = await boxFetch(`https://api.box.com/2.0/files/${csv.id}/content`, { headers: H });
        if (!cr.ok) return;
        const filtered = filterCsvForCaller(csv.name, await cr.text(), false, company, role);
        for (const row of parseCSVServer(filtered).rows) for (const id of fileIdsInRow(row)) ids.add(id);
      }));
    }));
  } catch (e) { /* fall through: empty set denies, which is the safe default */ }

  if (_allowCache.size > 200) _allowCache.clear();
  _allowCache.set(key, { set: ids, exp: Date.now() + ALLOW_TTL });
  return ids;
}

async function callerMayReadFile(H, t, grants, who, fileId) {
  // Locate the granted project this file sits under.
  const gidset = new Set(grants.map(g => String(g.id)));
  let projectId = null;
  const r = await boxFetch(`https://api.box.com/2.0/files/${encodeURIComponent(fileId)}?fields=path_collection`, { headers: H });
  if (!r.ok) return false;
  const d = await r.json();
  const ids = ((d.path_collection && d.path_collection.entries) || []).map(e => String(e.id));
  projectId = ids.find(x => gidset.has(x));
  if (!projectId) return false;
  // The project's own logo is branding, not a record. It lives in
  // Project Info.json rather than any CSV row, so the row check below would
  // deny it to everyone the project is shared with.
  try { const lg = await logoIdFor(H, projectId); if (lg && String(lg) === String(fileId)) return true; } catch (e) {}
  const allowed = await allowedFileIds(H, t, grants, who, projectId);
  return allowed.has(String(fileId));
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const _t0 = Date.now();
  const who = await caller(req);
  const _tAuth = Date.now() - _t0;
  if (!who) {
    if (LAST_AUTH_RATELIMITED) return json({ error: 'Verification service busy — please retry.', retry: true }, 503);
    return json({ error: 'Your session could not be verified. Please sign in again.' }, 401);
  }
  // Escape hatch in case a legitimate account predates verification being required.
  const REQUIRE_VERIFIED = String(process.env.REQUIRE_VERIFIED_EMAIL || 'false').toLowerCase() === 'true';
  if (REQUIRE_VERIFIED && who.verificationKnown && !who.emailVerified) {
    return json({ error: 'Please verify your email address before using the dashboard. Check your inbox for the verification link from Fidevia.', needsVerification: true }, 403);
  }

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
        const r = await boxFetch(`https://api.box.com/2.0/folders/${process.env.BOX_PROJECTS_ROOT_ID}/items?limit=1000&fields=id,name,type`, { headers: H });
        const d = await r.json();
        const projs = (d.entries || []).filter(e => e.type === 'folder' && !SYSTEM_FOLDERS.includes(e.name)).map(e => ({ id: e.id, name: e.name }));
        await Promise.all(projs.map(async pr => { pr.logoFileId = await logoIdFor(H, pr.id); }));
        return json({ rootId: String(process.env.BOX_PROJECTS_ROOT_ID || ''), projects: projs });
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
        // Accepts either a single projectId or a list, so granting several
        // projects at once writes one grant record and sends one email.
        const list = Array.isArray(body.projects) && body.projects.length
          ? body.projects.map(p => ({ id: String(p.id), name: p.name || '' })).filter(p => p.id)
          : (body.projectId ? [{ id: String(body.projectId), name: body.projectName || '' }] : []);
        if (!email || !list.length) return json({ error: 'email and at least one project are required' }, 400);
        const company = (body.company || '').trim();
        const role = (body.role || '').trim();
        const store = grantsStore();
        const g = (await store.get(email, { type: 'json' })) || { projects: [] };
        const added = [];
        for (const proj of list) {
          const ex = g.projects.find(p => String(p.id) === proj.id);
          if (ex) { ex.name = proj.name || ex.name; ex.company = company || ex.company || ''; ex.role = role || ex.role || ''; }
          else { g.projects.push({ id: proj.id, name: proj.name, company, role }); }
          added.push(proj.name || proj.id);
        }
        await store.setJSON(email, g);
        for (const proj of list) {
          try { const c = contactFromSnap(null, email); if (company) c['Company'] = company; if (role) c['Role'] = role; await addContactToProject(H, proj.id, c); } catch(e) {}
        }
        try { await sendGrantEmailMany(email, list.map(p => p.name), company, role); } catch(e) {}
        return json({ ok: true, granted: added });
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
      const r = await boxFetch(`https://api.box.com/2.0/folders/${process.env.BOX_PROJECTS_ROOT_ID}/items?limit=1000&fields=id,name,type`, { headers: H });
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
      try { await sendGrantEmail(email, body.projectName||'', company, role); } catch(e) {}
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
      const r = await boxFetch(`https://api.box.com/2.0/folders/${process.env.BOX_PROJECTS_ROOT_ID}/items?limit=1000&fields=id,name,type`, { headers: H });
      const d = await r.json();
      const existing = new Map((d.entries || []).filter(e => e.type === 'folder' && !SYSTEM_FOLDERS.includes(e.name)).map(e => [String(e.id), e.name]));
      const archived = new Set(await getArchivedIds());
      const mine = grants.filter(g => existing.has(String(g.id)) && !archived.has(String(g.id))).map(g => ({ id: g.id, name: existing.get(String(g.id)) || g.name, company: g.company || '', role: normRole(g.role) }));
      await Promise.all(mine.map(async pr => { pr.logoFileId = await logoIdFor(H, pr.id); }));
      return json({ projects: mine });
    }

    // ---- DATA OPS: enforce grant scope for non-admins ----
    const _grants = who.isAdmin ? [] : await getGrants(who.email);
    const grantedIds = who.isAdmin ? null : new Set(_grants.map(p => String(p.id)));
    const guardFolder = async (fid) => who.isAdmin || (await withinGranted(t, grantedIds, 'folder', fid));
    const guardFile = async (fid) => who.isAdmin || (await withinGranted(t, grantedIds, 'file', fid));

    if (op === 'list') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const r = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.folderId)}/items?limit=200&fields=id,name,type`, { headers: H });
      if (!r.ok) return json({ error: 'Box list ' + r.status }, r.status);
      return json(await r.json());
    }
    // Batch loader: read every module CSV for a project in a single invocation.
    // Replaces ~26 separate calls (one list + one read per module) that were
    // each doing their own Auth0 /userinfo and triggering rate-limit 401s.
    if (op === 'readModules') {
      const mods = Array.isArray(body.modules) ? body.modules.slice(0, 40) : [];
      if (!mods.length) return json({ data: {} });

      const folderIds = [...new Set(mods.map(m => String(m.folderId)).filter(Boolean))];
      const okFolder = {};
      await Promise.all(folderIds.map(async fid => { okFolder[fid] = await guardFolder(fid); }));

      // Resolve each module's file ID from cache where possible; only list the
      // folders we still have unknowns for.
      const need = new Set();
      for (const m of mods) {
        const fid = String(m.folderId || '');
        if (fid && okFolder[fid] && _fidGet(fid + '|' + m.filename) === null) need.add(fid);
      }
      const listing = {};
      await Promise.all([...need].map(async fid => {
        try {
          const r = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(fid)}/items?limit=1000&fields=id,name,type`, { headers: H });
          const entries = r.ok ? ((await r.json()).entries || []) : [];
          listing[fid] = entries;
          for (const e of entries) if (e.type === 'file') _fidSet(fid + '|' + e.name, e.id);
        } catch (e) { listing[fid] = []; }
      }));

      const companyCache = {};
      const data = {};
      await Promise.all(mods.map(async m => {
        const fid = String(m.folderId || '');
        data[m.key] = '';
        if (!fid || !okFolder[fid]) return;
        let fileId = _fidGet(fid + '|' + m.filename);
        if (!fileId) {
          const hit = (listing[fid] || []).find(i => i.type === 'file' && i.name === m.filename);
          if (!hit) return;
          fileId = hit.id;
        }
        try {
          let r = await boxFetch(`https://api.box.com/2.0/files/${fileId}/content`, { headers: H });
          // Stale cache entry (file replaced or deleted) — re-resolve once.
          if (r.status === 404 || r.status === 410) {
            _fidCache.delete(fid + '|' + m.filename);
            const lr = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(fid)}/items?limit=1000&fields=id,name,type`, { headers: H });
            const entries = lr.ok ? ((await lr.json()).entries || []) : [];
            const hit2 = entries.find(i => i.type === 'file' && i.name === m.filename);
            if (!hit2) return;
            _fidSet(fid + '|' + m.filename, hit2.id);
            r = await boxFetch(`https://api.box.com/2.0/files/${hit2.id}/content`, { headers: H });
          }
          let text = r.ok ? await r.text() : '';
          if (!who.isAdmin) {
            if (companyCache[fid] === undefined) {
              const g = await grantFor(t, _grants, 'folder', fid);
              companyCache[fid] = { company: (g && g.company) || '', role: normRole(g && g.role) };
            }
            const { company, role } = companyCache[fid];
            text = filterCsvForCaller(m.filename, text, false, company, role);
          }
          data[m.key] = text;
        } catch (e) {}
      }));
      return json({ data, _diag: { authMs: _tAuth, authVia: LAST_AUTH_VIA, totalMs: Date.now() - _t0, modules: mods.length, listed: need.size, rateLimited: RATE_LIMIT_HITS, emailVerified: who.emailVerified, verificationKnown: who.verificationKnown } });
    }

    if (op === 'readText') {
      if (!await guardFile(body.fileId)) return json({ error: 'Access denied' }, 403);
      let fname = '';
      try { const fi = await (await boxFetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}?fields=name`, { headers: H })).json(); fname = fi.name || ''; } catch (e) {}
      const r = await boxFetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}/content`, { headers: H });
      let text = r.ok ? await r.text() : '';
      if (!who.isAdmin) {
        const g = await grantFor(t, _grants, 'file', body.fileId);
        text = filterCsvForCaller(fname, text, false, (g && g.company) || '', normRole(g && g.role));
      }
      return json({ text });
    }
    if (op === 'downloadUrl') {
      if (!await guardFile(body.fileId)) return json({ error: 'Access denied' }, 403);
      // Project membership is not enough. A file is only fetchable if it appears
      // in a row this caller is allowed to see — otherwise an external user with
      // a file id could pull another company's pay app or an internal-only drawing.
      if (!who.isAdmin && !(await callerMayReadFile(H, t, _grants, who, body.fileId))) {
        return json({ error: 'Access denied' }, 403);
      }
      const r = await boxFetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}/content`, { headers: H, redirect: 'manual' });
      const loc = r.headers.get('location');
      return loc ? json({ url: loc }) : json({ error: 'No download URL' }, 502);
    }
    if (op === 'fileInfo') {
      if (!await guardFile(body.fileId)) return json({ error: 'Access denied' }, 403);
      // Same row check downloadUrl applies. Without it the name and size of
      // another company's pay application were readable by file id alone.
      if (!who.isAdmin && !(await callerMayReadFile(H, t, _grants, who, body.fileId))) {
        return json({ error: 'Access denied' }, 403);
      }
      const r = await boxFetch(`https://api.box.com/2.0/files/${encodeURIComponent(body.fileId)}?fields=id,name,size,modified_at`, { headers: H });
      if (!r.ok) return json({ error: 'Box file ' + r.status }, r.status);
      return json(await r.json());
    }
    // Mint a short-lived Box token scoped to ONE folder, upload-only, so the
    // browser can PUT large files straight to Box. Going through this function
    // caps uploads at ~4.4MB (Netlify 6MB body limit + base64 inflation).
    if (op === 'uploadToken') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      try {
        const r = await boxFetch('https://api.box.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token: t,
            subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
            scope: 'item_upload',
            resource: `https://api.box.com/2.0/folders/${encodeURIComponent(body.folderId)}`
          })
        });
        if (!r.ok) return json({ error: 'Token exchange failed ' + r.status }, 502);
        const d = await r.json();
        return json({ token: d.access_token, expiresIn: d.expires_in || 3600 });
      } catch (e) { return json({ error: 'Token exchange error' }, 502); }
    }

    if (op === 'upload') {
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const chk = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      if (chk.ok) { const items = (await chk.json()).entries || []; if (items.some(i => i.type === 'file' && i.name === body.filename)) return json({ error: 'A file with that name already exists.' }, 409); }
      const bytes = Uint8Array.from(atob(body.contentBase64), c => c.charCodeAt(0));
      const form = new FormData();
      form.append('attributes', JSON.stringify({ name: body.filename, parent: { id: String(body.folderId) } }));
      form.append('file', new Blob([bytes], { type: body.mime || 'application/octet-stream' }), body.filename);
      const r = await boxFetch('https://upload.box.com/api/2.0/files/content', { method: 'POST', headers: H, body: form });
      if (!r.ok) return json({ error: 'Upload failed ' + r.status }, r.status);
      return json({ ok: true, file: await r.json() });
    }

    if (op === 'ensureFolder') {
      if (!await guardFolder(body.parentId)) return json({ error: 'Access denied' }, 403);
      const name = String(body.name || '').trim();
      if (!name) return json({ error: 'name required' }, 400);
      const lr = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.parentId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = lr.ok ? ((await lr.json()).entries || []) : [];
      const found = items.find(i => i.type === 'folder' && i.name === name);
      if (found) return json({ ok: true, id: found.id });
      const cr = await boxFetch('https://api.box.com/2.0/folders', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parent: { id: String(body.parentId) } }) });
      if (!cr.ok) {
        if (cr.status === 409) {
          const lr2 = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(body.parentId)}/items?limit=1000&fields=id,name,type`, { headers: H });
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
      const lr = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = lr.ok ? ((await lr.json()).entries || []) : [];
      const logFile = items.find(i => i.type === 'file' && i.name === filename);
      if (!logFile) return json({ error: 'log not found' }, 404);
      const cr = await boxFetch(`https://api.box.com/2.0/files/${logFile.id}/content`, { headers: H });
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
      const ur = await boxFetch(`https://upload.box.com/api/2.0/files/${logFile.id}/content`, { method: 'POST', headers: H, body: form });
      if (!ur.ok) return json({ error: 'Save failed ' + ur.status }, ur.status);
      return json({ ok: true });
    }
    if (op === 'advanceWorkflow') {
      const { projectId, moduleFolderId, filename, wfKey, idField, idValue } = body;
      if (!await guardFolder(moduleFolderId)) return json({ error: 'Access denied' }, 403);
      if (!projectId || !moduleFolderId || !filename || !wfKey || !idField) return json({ error: 'missing fields' }, 400);
      // --- load project config (workflows) ---
      const pitems = (await (await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(projectId)}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      const cfgFile = pitems.find(e => e.type === 'file' && e.name === 'Project Info.json');
      let cfg = {}; if (cfgFile) { try { cfg = JSON.parse(await (await boxFetch(`https://api.box.com/2.0/files/${cfgFile.id}/content`, { headers: H })).text()) || {}; } catch (e) {} }
      // Resolve the chain the same way the client does: the submitting
      // company's override if it has one, otherwise the project default.
      const wfForCompany = (company) => {
        const t = String(company || '').trim().toLowerCase();
        if (t) {
          const byCo = cfg.workflowsByCompany || {};
          const ck = Object.keys(byCo).find(k => k.trim().toLowerCase() === t);
          if (ck) { const arr = (byCo[ck] || {})[wfKey]; if (Array.isArray(arr) && arr.length) return arr; }
        }
        return ((cfg.workflows || {})[wfKey]) || [];
      };
      const rowCompanyOf = (r) => {
        if (!r) return '';
        const direct = String(r['Company'] || r['Contractor'] || '').trim();
        if (direct) return direct;
        const m = String(r['Submitted By'] || r['Submitted By (Sub)'] || '').match(/\(([^)]+)\)\s*$/);
        return m ? m[1].trim() : '';
      };
      // --- contacts: name -> email ---
      const emailByName = {};
      try {
        const contF = pitems.find(e => e.type === 'folder' && e.name.startsWith('05'));
        if (contF) {
          const cit = (await (await boxFetch(`https://api.box.com/2.0/folders/${contF.id}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
          const ccsv = cit.find(e => e.type === 'file' && e.name.toLowerCase().endsWith('.csv'));
          if (ccsv) { const cp = parseCSVServer(await (await boxFetch(`https://api.box.com/2.0/files/${ccsv.id}/content`, { headers: H })).text()); cp.rows.forEach(r => { if (r['Name']) emailByName[String(r['Name']).trim().toLowerCase()] = String(r['Email'] || '').trim().toLowerCase(); }); }
        }
      } catch (e) {}
      // --- load the log CSV ---
      const mitems = (await (await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(moduleFolderId)}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      const logFile = mitems.find(e => e.type === 'file' && e.name === filename);
      if (!logFile) return json({ error: 'log not found' }, 404);
      const parsed = parseCSVServer(await (await boxFetch(`https://api.box.com/2.0/files/${logFile.id}/content`, { headers: H })).text());
      const headers = parsed.headers, rows = parsed.rows;
      const row = rows.find(r => String(r[idField] || '') === String(idValue || ''));
      if (!row) return json({ error: 'item not found' }, 404);
      if (String(row['Workflow Status'] || '').toLowerCase() === 'complete') return json({ error: 'Workflow already complete' }, 400);
      const steps = wfForCompany(rowCompanyOf(row));
      if (!steps.length) return json({ error: 'No workflow configured' }, 400);
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
      const ur = await boxFetch(`https://upload.box.com/api/2.0/files/${logFile.id}/content`, { method: 'POST', headers: H, body: form });
      if (!ur.ok) return json({ error: 'Save failed ' + ur.status }, ur.status);
      const nextNames = next >= steps.length ? [] : steps.slice(next, next + 1).map(s => s.person || s.name);
      return json({ ok: true, complete: next >= steps.length, nextStep: nextNames });
    }
    if (op === 'uploadText') {
      // Whole-file replacement. External users add records through appendRow,
      // which reads and rewrites the file on the server; letting them call this
      // would allow overwriting a log, the audit trail or the project config.
      if (!who.isAdmin) return json({ error: 'Access denied' }, 403);
      if (!await guardFolder(body.folderId)) return json({ error: 'Access denied' }, 403);
      const { folderId, filename, content } = body;
      if (!folderId || !filename) return json({ error: 'folderId and filename required' }, 400);
      const lr = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = lr.ok ? ((await lr.json()).entries || []) : [];
      const existing = items.find(i => i.type === 'file' && i.name === filename);
      const form = new FormData();
      form.append('attributes', JSON.stringify(existing ? { name: filename } : { name: filename, parent: { id: String(folderId) } }));
      form.append('file', new Blob([new TextEncoder().encode(String(content == null ? '' : content))], { type: 'text/plain' }), filename);
      const url = existing ? `https://upload.box.com/api/2.0/files/${existing.id}/content` : 'https://upload.box.com/api/2.0/files/content';
      const r = await boxFetch(url, { method: 'POST', headers: H, body: form });
      if (!r.ok) return json({ error: 'Upload failed ' + r.status }, r.status);
      return json({ ok: true, file: await r.json() });
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
      const lr = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items?limit=1000&fields=id,name,type`, { headers: H });
      const items = lr.ok ? ((await lr.json()).entries || []) : [];
      const existing = items.find(i => i.type === 'file' && i.name === filename);
      let out, uploadUrl, attrs;
      if (existing) {
        const cr = await boxFetch(`https://api.box.com/2.0/files/${existing.id}/content`, { headers: H });
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
      const ur = await boxFetch(uploadUrl, { method: 'POST', headers: H, body: form });
      if (!ur.ok) return json({ error: 'Append failed ' + ur.status }, ur.status);
      return json({ ok: true });
    }

    if (op === 'getNotifTemplates') {
      if (!await guardFolder(body.projectId)) return json({ error: 'Access denied' }, 403);
      const d = await notifStore().get(String(body.projectId), { type: 'json' });
      return json({ templates: d || null });
    }
    if (op === 'saveNotifTemplates') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      await notifStore().setJSON(String(body.projectId), body.templates || {});
      return json({ ok: true });
    }

    if (op === 'getReminderSettings') {
      if (!await guardFolder(body.projectId)) return json({ error: 'Access denied' }, 403);
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
      // Return the profile details as well. The walk already reads each blob,
      // so this costs nothing extra and lets the client flag project contacts
      // whose details disagree with the directory.
      const profiles = {};
      try {
        const { blobs } = await store.list();
        for (const b of (blobs || [])) {
          try {
            const pr = await store.get(b.key, { type: 'json' });
            if (pr && pr.email) {
              const em = String(pr.email).trim().toLowerCase();
              emails.push(em);
              profiles[em] = {
                name: (((pr.first_name || '') + ' ' + (pr.last_name || '')).trim()) || '',
                company: pr.company || '',
                phone: pr.phone || '',
                title: pr.title || ''
              };
            }
          } catch (e) {}
        }
      } catch (e) {}
      return json({ emails: [...new Set(emails)], profiles });
    }
    if (op === 'projectCompanies') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const pid = String(body.projectId || ''); if (!pid) return json({ companies: [] });
      const companies = new Set();
      try {
        const items = (await (await boxFetch(`https://api.box.com/2.0/folders/${pid}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
        const cfgFile = items.find(e => e.type === 'file' && e.name === 'Project Info.json');
        if (cfgFile) { try { const cfg = JSON.parse(await (await boxFetch(`https://api.box.com/2.0/files/${cfgFile.id}/content`, { headers: H })).text()); (cfg.contractors || []).forEach(c => { if (c.name) companies.add(String(c.name).trim()); }); } catch(e) {} }
        const contF = items.find(e => e.type === 'folder' && e.name.startsWith('05'));
        if (contF) { const cit = (await (await boxFetch(`https://api.box.com/2.0/folders/${contF.id}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || []; const csv = cit.find(e => e.type === 'file' && e.name.toLowerCase().endsWith('.csv')); if (csv) { const parsed = parseCSVServer(await (await boxFetch(`https://api.box.com/2.0/files/${csv.id}/content`, { headers: H })).text()); parsed.rows.forEach(r => { if (r['Company']) companies.add(String(r['Company']).trim()); }); } }
      } catch(e) {}
      return json({ companies: [...companies].filter(Boolean) });
    }
    if (op === 'renameProject') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const pid = String(body.projectId || ''); const name = String(body.name || '').trim();
      if (!pid || !name) return json({ error: 'projectId and name required' }, 400);
      const r = await boxFetch(`https://api.box.com/2.0/folders/${encodeURIComponent(pid)}`, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!r.ok) return json({ error: r.status === 409 ? 'A project with that name already exists.' : ('Rename failed ' + r.status) }, r.status);
      try { const gstore = grantsStore(); const { blobs } = await gstore.list();
        for (const b of blobs) { const g = await gstore.get(b.key, { type: 'json' }); if (!g) continue; let ch = false;
          (g.projects || []).forEach(p2 => { if (String(p2.id) === pid) { p2.name = name; ch = true; } });
          if (ch) await gstore.setJSON(b.key, g); } } catch (e) {}
      return json({ ok: true, name });
    }
    if (op === 'exportContacts') {
      if (!who.isAdmin) return json({ error: 'Admins only' }, 403);
      const store = getStore('profiles');
      const rows = [];
      try { const { blobs } = await store.list(); for (const b of (blobs || [])) { try { const p2 = await store.get(b.key, { type: 'json' }); if (p2 && p2.email) rows.push([(((p2.first_name || '') + ' ' + (p2.last_name || '')).trim()) || p2.email, p2.company || '', p2.title || '', p2.email, p2.phone || '']); } catch (e) {} } } catch (e) {}
      rows.sort((a, b) => a[0].localeCompare(b[0]));
      const csv = ['Name','Company','Role','Email','Phone'].join(',') + '\n' + rows.map(r => r.map(csvEsc).join(',')).join('\n') + '\n';
      const parent = process.env.BOX_PROJECTS_ROOT_ID;
      const pit = (await (await boxFetch(`https://api.box.com/2.0/folders/${parent}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      let snap = pit.find(e => e.type === 'folder' && e.name === 'Contact Directory Snapshots');
      let snapId = snap ? snap.id : null;
      if (!snapId) { const cr = await boxFetch('https://api.box.com/2.0/folders', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Contact Directory Snapshots', parent: { id: String(parent) } }) }); if (cr.ok) snapId = (await cr.json()).id; }
      if (!snapId) return json({ error: 'Could not create snapshot folder' }, 500);
      const name = 'Contacts ' + new Date().toISOString().slice(0, 10) + '.csv';
      const items = (await (await boxFetch(`https://api.box.com/2.0/folders/${snapId}/items?limit=1000&fields=id,name,type`, { headers: H })).json()).entries || [];
      const ex = items.find(e => e.type === 'file' && e.name === name);
      const form = new FormData();
      form.append('attributes', JSON.stringify(ex ? { name } : { name, parent: { id: String(snapId) } }));
      form.append('file', new Blob([new TextEncoder().encode(csv)], { type: 'text/csv' }), name);
      const url = ex ? `https://upload.box.com/api/2.0/files/${ex.id}/content` : 'https://upload.box.com/api/2.0/files/content';
      const r = await boxFetch(url, { method: 'POST', headers: H, body: form });
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
          const origin = 'https://dashboard.fidevia.com';
          const html = `<div style="background:#f4f2ec;padding:28px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2ddd5;border-radius:12px;overflow:hidden"><tr><td style="padding:26px 24px 12px;text-align:center"><img src="${origin}/fidevia-email-logo.png" alt="Fidevia" width="164" style="display:block;margin:0 auto 6px;max-width:164px;height:auto"><div style="font-size:11px;letter-spacing:2px;color:#8a8550;text-transform:uppercase">Construction Dashboard</div></td></tr><tr><td style="padding:0 24px"><div style="height:2px;line-height:2px;font-size:0;background:#515520">&nbsp;</div></td></tr><tr><td style="padding:24px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;margin:0 0 12px"><span style="color:#515520">Project closing:</span> <span style="color:#2f2f2f">${body.projectName || 'Project'}</span></div><p style="font-size:14px;color:#2f2f2f;line-height:1.6;margin:0 0 14px">This project will be archived on <strong>${when}</strong>. After that date it will no longer appear in your project list and you will not be able to access its records.</p><p style="font-size:14px;color:#2f2f2f;line-height:1.6;margin:0 0 14px">If you need copies of any documents, please download them before then.</p><div style="text-align:center;margin:22px 0 4px"><a href="${origin}" style="display:inline-block;background:#515520;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 30px;border-radius:6px">Open the Dashboard</a></div></td></tr><tr><td style="padding:14px 24px 22px;text-align:center;border-top:1px solid #f0ece3"><div style="font-size:11px;color:#b3b0a4;line-height:1.6">Sent from the Fidevia Construction Dashboard.</div></td></tr></table></div>`;
          await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SENDGRID_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: emails.map(e => ({ email: e })) }], from: { email: process.env.FROM_EMAIL || 'dashboard@fidevia.com', name: 'Fidevia Dashboard' }, subject: '[Fidevia] ' + (body.projectName || 'Project') + ' will be archived on ' + when, content: [{ type: 'text/html', value: html }] }) });
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
      const r = await boxFetch(`https://api.box.com/2.0/folders/${id}?recursive=true`, { method: 'DELETE', headers: H });
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
