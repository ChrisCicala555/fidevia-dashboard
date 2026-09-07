// Every notification the browser sends passes through here, which makes this
// the one honest place to write down that it happened. The log is written
// after the fact and never blocks or fails the send.
exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  let meta = null;
  try {
    const parsed = JSON.parse(event.body);
    const { to, subject, body, attachments, replyTo } = parsed;
    if(!to || !subject || !body) return { statusCode: 400, body: 'Missing fields' };
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
    if(replyTo) payload.reply_to = { email: replyTo };
    if(Array.isArray(attachments) && attachments.length){
      const atts = attachments
        .filter(a => a && a.content && a.filename)
        .map(a => ({ content: a.content, filename: a.filename, type: a.type || 'application/octet-stream', disposition: 'attachment' }));
      if(atts.length) payload.attachments = atts;
    }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.SENDGRID_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const ok = res.status === 202;
    await record(Object.assign({}, meta, ok ? {} : { ok: false, error: 'SendGrid ' + res.status }));
    return { statusCode: ok ? 202 : res.status, body: 'ok' };
  } catch(e) {
    if(meta) await record(Object.assign({}, meta, { ok: false, error: e.message }));
    return { statusCode: 500, body: e.message };
  }
};

// This file is CommonJS and the log is an ES module, so the import is dynamic.
async function record(entry){
  try { const m = await import('./notif-log.mjs'); await m.logNotif(entry); } catch(e) {}
}
