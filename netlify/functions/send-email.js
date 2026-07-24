exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { to, subject, body } = JSON.parse(event.body);
    if(!to || !subject || !body) return { statusCode: 400, body: 'Missing fields' };
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.SENDGRID_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: Array.isArray(to) ? to.map(e=>({email:e})) : [{email:to}] }],
        from: { email: process.env.FROM_EMAIL || 'clymerllc@gmail.com', name: 'Fidevia Dashboard' },
        subject: subject,
        content: [{ type: 'text/html', value: body }]
      })
    });
    return { statusCode: res.status === 202 ? 202 : res.status, body: 'ok' };
  } catch(e) {
    return { statusCode: 500, body: e.message };
  }
};
