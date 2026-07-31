exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { to, subject, body, attachments, replyTo } = JSON.parse(event.body);
    if(!to || !subject || !body) return { statusCode: 400, body: 'Missing fields' };
    const toArr = Array.isArray(to) ? to : [to];
    const payload = {
      personalizations: [{ to: toArr.map(e => ({ email: e })) }],
      from: { email: process.env.FROM_EMAIL || 'clymerllc@gmail.com', name: 'Fidevia Dashboard' },
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
    return { statusCode: res.status === 202 ? 202 : res.status, body: 'ok' };
  } catch(e) {
    return { statusCode: 500, body: e.message };
  }
};
