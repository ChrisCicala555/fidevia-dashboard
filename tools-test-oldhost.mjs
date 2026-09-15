// Christopher's Firefox window was on chriscicala555.github.io/fidevia-dashboard/
// — the copy served from GitHub Pages before the dashboard had a back end.
//
// It still loads, and it cannot work. Everything under /api/ is a Netlify
// Function; GitHub Pages serves static files only, so every call comes back 404
// or 405 with no body. That is not a visible failure: the page renders, Auth0
// signs you in, and then the profile lookup fails — which is exactly how he was
// asked to create an account he already had.
//
// Nothing on the screen said he was at the wrong address. Now it does, and does
// not stay there.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-oldhost.mjs — jsdom not installed (npm i)'); process.exit(0); }

const guard = html.slice(html.indexOf('// ── THE OLD ADDRESS ──'), html.indexOf('// ── CONFIG ──'));

const run = (hostname, search, hash) => {
  const dom = new JSDOM('<!doctype html><html><body><p>real page</p></body></html>');
  const { window } = dom;
  let went=null;
  const loc = { hostname, search:search||'', hash:hash||'', replace:(u)=>{ went=u; } };
  new window.Function('location','document', guard)(loc, window.document);
  return { went, html: window.document.documentElement.innerHTML };
};

console.log('The old address');
{
  const r = run('chriscicala555.github.io');
  ok(r.went==='https://dashboard.fidevia.com/', 'a github.io host is sent to the real one');
  ok(/old address for the dashboard/.test(r.html), 'and told why, rather than just blinking');
  ok(/dashboard\.fidevia\.com/.test(r.html), 'naming where it is going');
  ok(!/real page/.test(r.html), 'with the half-working copy taken off the screen');
  ok(/<a href="https:\/\/dashboard\.fidevia\.com\//.test(r.html),
     'and a link, for when the automatic hop is blocked');
}
{
  const r = run('CHRISCICALA555.GITHUB.IO');
  ok(r.went!==null, 'matched however the host is cased');
}
{
  const r = run('chriscicala555.github.io','?project=123','#rfis');
  ok(r.went==='https://dashboard.fidevia.com/?project=123#rfis',
     'a query and a fragment survive the hop — got '+r.went);
}
{
  const r = run('chriscicala555.github.io','?','');
  ok(r.went==='https://dashboard.fidevia.com/', 'an empty query is not carried over as a bare ?');
}

console.log('Everywhere else is left alone');
{
  for(const h of ['dashboard.fidevia.com','localhost','127.0.0.1',
                  'deploy-preview-12--fidevia.netlify.app','fidevia.netlify.app']){
    const r = run(h);
    ok(r.went===null && /real page/.test(r.html), h+' loads normally');
  }
}
{
  // The one that would catch a careless suffix test.
  const r = run('github.io.example.com');
  ok(r.went===null, 'a host that merely contains github.io is not redirected');
}

console.log('Where it sits');
ok(html.indexOf('THE OLD ADDRESS') < html.indexOf('const AUTH0_CLIENT_ID'),
   'the guard runs before Auth0 is configured, so nothing half-boots at the wrong address');
ok(html.indexOf('THE OLD ADDRESS') < html.indexOf('async function fetchProfile'),
   'and before anything asks the server that is not there');

console.log((bad?'FAIL':'ok  ')+' tools-test-oldhost.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
