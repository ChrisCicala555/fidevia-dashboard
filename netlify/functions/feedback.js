exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { message, from, context } = JSON.parse(event.body);
    if(!message || !String(message).trim()) return { statusCode: 400, body: 'Missing message' };
    const to = process.env.FEEDBACK_EMAIL || process.env.FROM_EMAIL || 'clymerllc@gmail.com';
    const esc = s => String(s==null?'':s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    const html = '<div style="font-family:Arial,sans-serif;max-width:600px">'
      + '<h3 style="color:#515520">Fidevia Dashboard — Feedback / Bug Report</h3>'
      + '<p><strong>From:</strong> '+esc(from||'anonymous')+'</p>'
      + '<p><strong>Where:</strong> '+esc(context||'')+'</p>'
      + '<p><strong>Message:</strong></p>'
      + '<p style="white-space:pre-wrap;background:#faf9f6;border:1px solid #e2ddd5;border-radius:6px;padding:12px">'+esc(message)+'</p></div>';
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.FROM_EMAIL || 'clymerllc@gmail.com', name: 'Fidevia Dashboard' },
      subject: '[Fidevia Dashboard] Feedback / Bug Report',
      content: [{ type: 'text/html', value: html }]
    };
    if(from) payload.reply_to = { email: from };
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
