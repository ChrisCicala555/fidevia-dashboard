// The notification log said "SendGrid 401" against every failed send. True,
// and it tells a reader nothing about what to go and change - and a revoked
// key and a SENDGRID_KEY nobody set produce the same 401, which are fixed in
// different places.
import fs from 'fs';
const { sendGridWhy, sendGridKeyMissing, NO_KEY } = await import('./netlify/functions/lib/sendgrid-why.mjs');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

console.log('It says what to go and change');
ok(/revoked or regenerated/.test(sendGridWhy(401)) && /SENDGRID_KEY/.test(sendGridWhy(401)),
   '401 names both causes, because the log cannot tell them apart');
ok(/Mail Send permission/.test(sendGridWhy(403)), '403 points at the key’s permission');
ok(/attachment/.test(sendGridWhy(413)), '413 points at the attachment');
ok(/again shortly/.test(sendGridWhy(429)), '429 says it will pass');
ok(/their end/.test(sendGridWhy(500)) && /their end/.test(sendGridWhy(503)),
   'and a 5xx is said to be theirs, not something to go hunting for here');
ok(sendGridWhy(418)==='SendGrid 418', 'a status nobody has a sentence for is still reported');

console.log('A missing key is not a rejected one');
{
  const had=process.env.SENDGRID_KEY;
  delete process.env.SENDGRID_KEY;
  ok(sendGridKeyMissing()===true, 'no variable at all is missing');
  process.env.SENDGRID_KEY='   ';
  ok(sendGridKeyMissing()===true, 'and so is one that is only whitespace');
  process.env.SENDGRID_KEY='SG.abc';
  ok(sendGridKeyMissing()===false, 'a real one is not');
  if(had===undefined) delete process.env.SENDGRID_KEY; else process.env.SENDGRID_KEY=had;
}
ok(/SENDGRID_KEY/.test(NO_KEY), 'and the message names the variable to set');

console.log('Every function reports through it');
['box-proxy','reminders','send-email'].forEach(f=>{
  const src=fs.readFileSync('netlify/functions/'+f+'.mjs','utf8');
  ok(/sendgrid-why\.mjs/.test(src), f+' imports the shared explanation');
  ok(!/'SendGrid ' *\+ *(r|r2|res)\.status/.test(src), f+' no longer logs a bare status');
});
{
  const se=fs.readFileSync('netlify/functions/send-email.mjs','utf8');
  ok(/if \(sendGridKeyMissing\(\)\)/.test(se), 'and the send stops before calling out with no key');
  ok(se.indexOf('sendGridKeyMissing')<se.indexOf("fetch('https://api.sendgrid.com"),
     'checked before the request, not after it comes back 401');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
