// Everything Netlify will treat as a function must actually be one.
//
// Netlify builds every top-level file in netlify/functions as its own function.
// A shared module living there has no handler, and the deploy fails — silently,
// as far as anyone looking at the site is concerned: the old build stays up and
// the repo runs ahead of what is live. Shared code goes in a subdirectory,
// which Netlify does not treat as functions.
import fs from 'fs';
import path from 'path';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const dir='netlify/functions';
const top=fs.readdirSync(dir).filter(f=>fs.statSync(path.join(dir,f)).isFile());
ok(top.length>0, 'there are functions to check');
top.forEach(f=>{
  const src=fs.readFileSync(path.join(dir,f),'utf8');
  ok(/export default|exports\.handler|export const handler/.test(src),
     f+' has a handler, so Netlify can build it');
});
// And the shared module is where it cannot be mistaken for one.
ok(fs.existsSync(path.join(dir,'lib','notif-log.mjs')),
   'the notification log helper lives in lib/, out of the functions Netlify builds');
ok(!fs.existsSync(path.join(dir,'notif-log.mjs')),
   'and not beside them');
['box-proxy.mjs','reminders.mjs','send-email.js'].forEach(f=>{
  const src=fs.readFileSync(path.join(dir,f),'utf8');
  if(/notif-log/.test(src)) ok(/\.\/lib\/notif-log\.mjs/.test(src), f+' imports it from lib/');
});
// Every relative import inside a function must resolve on disk.
top.concat(fs.existsSync(path.join(dir,'lib'))?fs.readdirSync(path.join(dir,'lib')).map(x=>'lib/'+x):[])
  .forEach(rel=>{
    const p=path.join(dir,rel);
    if(!/\.(mjs|js)$/.test(p)) return;
    const src=fs.readFileSync(p,'utf8');
    [...src.matchAll(/from\s+'(\.[^']+)'/g), ...src.matchAll(/import\('(\.[^']+)'\)/g)]
      .forEach(m=>{
        const target=path.resolve(path.dirname(p), m[1]);
        ok(fs.existsSync(target), rel+' imports '+m[1]+', which exists');
      });
  });

console.log((bad?'FAIL':'ok  '),' tools-test-deployable.mjs —',n,'assertions');
process.exit(bad?1:0);
