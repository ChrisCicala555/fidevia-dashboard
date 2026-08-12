import { getStore } from '@netlify/blobs';

const ROOT_NAME = 'Construction Dashboard';

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
  if (!d.access_token) return null;
  _svc = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return _svc.token;
}

async function listFolder(t, id) {
  const r = await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`, { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) return [];
  return (await r.json()).entries || [];
}
function parseCSV(text) {
  if (!text || !text.trim()) return [];
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
  const pl = (line) => { const res = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === ',' && !q) { res.push(cur.trim()); cur = ''; } else cur += c; } res.push(cur.trim()); return res; };
  const headers = pl(lines[0]);
  return lines.slice(1).map(l => { const v = pl(l), o = {}; headers.forEach((h, i) => o[h] = v[i] !== undefined ? v[i] : ''); return o; });
}
async function readCSV(t, folderId, filename) {
  const items = await listFolder(t, folderId);
  const f = items.find(i => i.type === 'file' && i.name === filename);
  if (!f) return [];
  const r = await fetch(`https://api.box.com/2.0/files/${f.id}/content`, { headers: { Authorization: 'Bearer ' + t } });
  return r.ok ? parseCSV(await r.text()) : [];
}
async function sendEmail(to, subject, html) {
  if (!to.length) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SENDGRID_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: to.map(e => ({ email: e })) }],
      from: { email: process.env.FROM_EMAIL || 'dashboard@fidevia.com', name: 'Fidevia Dashboard' },
      subject, content: [{ type: 'text/html', value: html }]
    })
  });
}
const notDone = s => { const st = (s || '').toLowerCase(); return !(st.indexOf('approv') >= 0 || st.indexOf('reject') >= 0 || st.indexOf('den') >= 0 || st.indexOf('closed') >= 0 || st.indexOf('signed') >= 0); };
const ageDays = (d, now) => { const t = Date.parse(d); return isNaN(t) ? 0 : Math.floor((now - t) / 86400000); };

function digestHTML(project, items) {
  const origin = 'https://dashboard.fidevia.com';
  const serif = "Georgia,'Times New Roman',Times,serif";
  const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const rows = items.map((it, i) => `<tr style="background:${i%2?'#ffffff':'#faf9f6'}"><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#515520;font-family:${sans};border-bottom:1px solid #ece8df;white-space:nowrap">${it.type} ${it.id || ''}</td><td style="padding:10px 16px;font-size:13px;color:#2f2f2f;font-family:${sans};border-bottom:1px solid #ece8df">${it.title || ''}</td><td style="padding:10px 16px;font-size:13px;color:#a1552b;font-family:${sans};border-bottom:1px solid #ece8df;white-space:nowrap">${it.reason}</td></tr>`).join('');
  return `<div style="background:#f4f2ec;padding:28px 16px;font-family:${sans}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2ddd5;border-radius:12px;overflow:hidden">
    <tr><td style="padding:26px 24px 12px;text-align:center">
      <img src="${origin}/fidevia-email-logo.png" alt="Fidevia" width="164" style="display:block;margin:0 auto 6px;max-width:164px;height:auto">
      <div style="font-size:11px;letter-spacing:2px;color:#8a8550;text-transform:uppercase">Construction Dashboard</div></td></tr>
    <tr><td style="padding:0 24px"><div style="height:2px;line-height:2px;font-size:0;background:#515520">&nbsp;</div></td></tr>
    <tr><td style="padding:22px 24px 6px">
      <div style="font-family:${serif};font-size:20px;color:#515520;font-weight:700;margin:0 0 4px">Outstanding items</div>
      <div style="font-size:12px;color:#9a988c;text-transform:uppercase;letter-spacing:.6px;margin:0 0 16px">Project: ${project}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ece8df;border-radius:8px;overflow:hidden">${rows}</table>
      <div style="text-align:center;margin:22px 0 4px"><a href="${origin}" style="display:inline-block;background:#515520;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 26px;border-radius:6px">Review in Dashboard</a></div>
    </td></tr>
    <tr><td style="padding:14px 24px 22px;text-align:center;border-top:1px solid #f0ece3">
      <div style="font-size:11px;color:#b3b0a4;line-height:1.6">Automated reminder from the Fidevia Construction Dashboard.<br>Fidevia &middot; Construction Management &amp; Consulting</div></td></tr>
    </table></div>`;
}

export default async () => {
  const t = await serviceToken();
  if (!t) return new Response('no token', { status: 500 });
  const root = (await listFolder(t, '0')).find(i => i.type === 'folder' && i.name === ROOT_NAME);
  if (!root) return new Response('no root folder');
  const projects = (await listFolder(t, root.id)).filter(i => i.type === 'folder');
  const store = getStore('reminder-settings');
  const now = Date.now();
  const dow = new Date().getUTCDay(); // 0 Sun, 1 Mon
  let sent = 0;

  for (const p of projects) {
    let cfg = null;
    try { cfg = await store.get(String(p.id), { type: 'json' }); } catch (e) {}
    if (!cfg || !cfg.enabled) continue;
    if ((cfg.frequency || 'weekly') === 'weekly' && dow !== 1) continue;

    const items = await listFolder(t, p.id);
    const gf = pfx => { const f = items.find(i => i.type === 'folder' && i.name.startsWith(pfx)); return f ? f.id : null; };
    const rfiF = gf('01'), coF = gf('02'), subF = gf('03'), payF = gf('09'), conF = gf('05');
    const agingDays = cfg.agingDays || 7;
    const out = [];

    if (rfiF) (await readCSV(t, rfiF, 'RFI Log.csv')).forEach(r => {
      if (!notDone(r['Status'])) return;
      const overdue = r['Due Date'] && Date.parse(r['Due Date']) < now;
      const age = ageDays(r['Date Submitted'], now);
      if (cfg.overdue && overdue) out.push({ type: 'RFI', id: r['RFI #'], title: r['Subject'], reason: 'Overdue' });
      else if (cfg.aging && age >= agingDays) out.push({ type: 'RFI', id: r['RFI #'], title: r['Subject'], reason: 'Open ' + age + ' days' });
    });
    if (subF && cfg.aging) (await readCSV(t, subF, 'Submittals Log.csv')).forEach(r => {
      if (!notDone(r['Status'])) return;
      const age = ageDays(r['Date Submitted'], now);
      if (age >= agingDays) out.push({ type: 'Submittal', id: r['Submittal #'], title: r['Description'], reason: 'Open ' + age + ' days' });
    });
    if (coF && cfg.aging) (await readCSV(t, coF, 'Change Order Log.csv')).forEach(r => {
      if (!notDone(r['Status'])) return;
      const age = ageDays(r['Date Submitted'], now);
      if (age >= agingDays) out.push({ type: 'Change Order', id: r['CO #'], title: r['Description'], reason: 'Open ' + age + ' days' });
    });
    if (cfg.payapps && payF) (await readCSV(t, payF, 'Payment Applications.csv')).forEach(r => {
      const st = (r['Status'] || '').toLowerCase();
      if (st.indexOf('submit') >= 0 || st.indexOf('pending') >= 0) out.push({ type: 'Pay App', id: r['App #'], title: r['Contractor'], reason: 'Awaiting review' });
    });

    if (!out.length) continue;

    let emails = [];
    if (conF) (await readCSV(t, conF, 'Job Contacts.csv')).forEach(r => {
      const any = ['Notify - RFI', 'Notify - CO', 'Notify - Submittal'].some(k => (r[k] || '').toLowerCase() === 'yes');
      if (any && r['Email']) emails.push(r['Email']);
    });
    emails = [...new Set(emails.map(e => e.trim().toLowerCase()))].filter(Boolean);
    if (!emails.length) continue;

    await sendEmail(emails, '[Fidevia] Outstanding items — ' + p.name, digestHTML(p.name, out));
    sent++;
  }
  return new Response('reminders sent: ' + sent);
};

export const config = { schedule: '0 13 * * *' };
