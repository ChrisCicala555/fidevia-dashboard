// Every notification the browser sends passes through here, which makes this
// the one honest place to write down that it happened.
//
// This was CommonJS, reaching the log through a dynamic import inside a
// try/catch that swallowed everything. The two functions that log successfully
// — box-proxy and reminders — are both ES modules importing it statically, and
// this was the only send path missing from the Notification Log. A dynamic
// import out of a CJS function is the kind of thing a bundler resolves
// differently, and the silent catch meant it failed without saying so: the log
// looked as though nothing but access grants had ever been sent.
//
// (Written without the import expression spelled out: tools-test-deployable
// scans these files for import specifiers and checks each resolves on disk,
// and a specifier quoted in a comment is indistinguishable from a real one.)
//
// So: same module system and the same static import as the ones that work, and
// a failure to record now says so rather than disappearing.
import { logNotif } from './lib/notif-log.mjs';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// Writing the log must never fail a send that already happened — but it must
// not be invisible either.
async function record(entry) {
  try { await logNotif(entry); return true; }
  catch (e) { console.error('[send-email] notification log write failed:', e && e.message); return false; }
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let meta = null;
  try {
    const parsed = await req.json();
    const { to, subject, body, attachments, replyTo } = parsed;
    if (!to || !subject || !body) return json({ error: 'Missing fields' }, 400);
    const toArr = Array.isArray(to) ? to : [to];
    // Trust the caller for context only — kind, project, who pressed the
    // button. The recipients and subject come from the message actually sent.
    meta = {
      to: toArr, subject,
      kind: parsed.kind || '', trigger: parsed.trigger || 'auto',
      projectId: parsed.projectId || '', project: parsed.project || '', by: parsed.by || ''
    };
    const payload = {
      personalizations: [{ to: toArr.map(e => ({ email: e })) }],
      from: { email: process.env.FROM_EMAIL || 'dashboard@fidevia.com', name: 'Fidevia Dashboard' },
      subject: subject,
      content: [{ type: 'text/html', value: body }]
    };
    if (replyTo) payload.reply_to = { email: replyTo };
    if (Array.isArray(attachments) && attachments.length) {
      const atts = attachments
        .filter(a => a && a.content && a.filename)
        .map(a => ({ content: a.content, filename: a.filename, type: a.type || 'application/octet-stream', disposition: 'attachment' }));
      if (atts.length) payload.attachments = atts;
    }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.SENDGRID_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const ok = res.status === 202;
    // A refused send is a thing that happened and belongs in the log with its
    // reason, which is why this records on both paths rather than only on ok.
    const logged = await record(Object.assign({}, meta, ok ? { ok: true } : { ok: false, error: 'SendGrid ' + res.status }));
    return json({ ok, logged }, ok ? 202 : res.status);
  } catch (e) {
    if (meta) await record(Object.assign({}, meta, { ok: false, error: e.message }));
    return json({ error: e.message }, 500);
  }
};
