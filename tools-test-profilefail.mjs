// Christopher signed in on a new browser with an account he had used before,
// and was asked to create it again. Then the picker said "Proxy error 405".
//
// One cause. The onboarding check did this:
//
//   try{ const r = await fetch('/api/profile', ...); if(r.ok){ ...localProf... } }catch(e){}
//   if(!meta.onboarded && !(localProf&&localProf.onboarded)){ show the form }
//
// A request that FAILED was indistinguishable from an answer of "no profile".
// On the browser he always uses, a cached copy hid it. On a new one there is
// nothing to hide it with — so an existing user was put in front of the sign-up
// form, and saving it would have written over the profile he already had, since
// the server rebuilds the record from the fields posted.
//
// The 405 came from the same place: /api/* not reaching the functions.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

let JSDOM;
try{ ({ JSDOM } = await import('jsdom')); }
catch(e){ console.log('SKIP tools-test-profilefail.mjs — jsdom not installed (npm i)'); process.exit(0); }
const { window } = new JSDOM('<!doctype html><body></body>');
const grab = name => {
  let i=html.indexOf('function '+name+'(');
  if(html.slice(i-6,i)==='async ') i-=6;
  return html.slice(i, html.indexOf('\n}', i)+2);
};

// fetchProfile, with the network and the token under our control.
const mk = (responses) => {
  const calls=[];
  const fetchStub = async () => {
    calls.push(1);
    const spec = responses[Math.min(calls.length-1, responses.length-1)];
    if(spec==='throw') throw new Error('network');
    return { ok: spec.status>=200 && spec.status<300, status: spec.status,
             json: async()=>{ if(spec.bad) throw new Error('not json'); return spec.body||{}; } };
  };
  const fn = new window.Function('fetch','auth0Client','setTimeout', `
    ${grab('fetchProfile')}
    return fetchProfile;
  `)(fetchStub, {getTokenSilently:async()=>'tok'}, (f)=>f());
  return {fn, calls};
};

console.log('A lookup that could not be made is not an answer');
{
  const {fn, calls} = mk([{status:405}]);
  const r = await fn(3);
  ok(r.ok===false, 'three 405s report failure rather than "no profile"');
  ok(calls.length===3, 'having actually retried — got '+calls.length);
  ok(r.profile===undefined, 'and hand back no profile to act on');
}
{
  const {fn, calls} = mk(['throw']);
  ok((await fn(3)).ok===false, 'a network error the same');
  ok(calls.length===3, 'and is retried too');
}
{
  const {fn} = mk([{status:500}]);
  ok((await fn(2)).ok===false, 'so is a server error');
}
{
  // A body that is not JSON is not an answer either.
  const {fn} = mk([{status:200, bad:true}]);
  ok((await fn(2)).ok===false, 'a 200 that is not JSON is a failure, not an empty profile');
}

console.log('A lookup that succeeded is');
{
  const {fn, calls} = mk([{status:200, body:{profile:{onboarded:true, first_name:'Jordan'}}}]);
  const r = await fn(3);
  ok(r.ok===true && r.profile.first_name==='Jordan', 'the profile comes back');
  ok(calls.length===1, 'in one call, with no needless retry');
}
{
  // Genuinely new: the server answers, and the answer is that there is none.
  const {fn} = mk([{status:200, body:{profile:null}}]);
  const r = await fn(3);
  ok(r.ok===true, 'the question was put');
  ok(r.profile===null, 'and the answer is that there is no profile — this is the case that SHOULD onboard');
}
{
  // Recovers part way through.
  const {fn, calls} = mk([{status:405},{status:405},{status:200, body:{profile:{onboarded:true}}}]);
  const r = await fn(3);
  ok(r.ok===true && !!r.profile, 'a lookup that comes good on the third try is used');
  ok(calls.length===3, 'after exactly the failures it took');
}

console.log('What the boot does with each');
{
  const b = html.slice(html.indexOf('// Onboarding check'));
  const body = b.slice(0, b.indexOf('// Determine role from server'));
  ok(/const look = await fetchProfile\(\);/.test(body), 'the boot asks through the retrying lookup');
  ok(/if\(!look\.ok && !\(localProf && localProf\.onboarded\) && !meta\.onboarded\)\{/.test(body),
     'and treats "could not ask" as its own case');
  ok(body.indexOf('!look.ok') < body.indexOf("if(!meta.onboarded && !(localProf&&localProf.onboarded)){"),
     'checked before the onboarding form, not after');
  ok(/prof-unreachable'\); if\(u\) u\.style\.display=''/.test(body), 'showing the cannot-reach card');
  ok(/prof-form-card'\); if\(f\) f\.style\.display='none'/.test(body), 'and hiding the form');
  ok(/showScreen\('screen-profile'\); return;[\s\S]{0,400}if\(!meta\.onboarded/.test(body),
     'and stopping there rather than falling through');
  ok(!/const r = await fetch\('\/api\/profile'/.test(body),
     'the one-shot fetch that could not tell the two apart is gone');
  // A cached profile is still good enough to get on with.
  ok(/!\(localProf && localProf\.onboarded\)/.test(body),
     'somebody with a cached profile is not stopped by a failed lookup');
}

console.log('The card itself');
{
  const i=html.indexOf('id="prof-unreachable"');
  const card=html.slice(i, html.indexOf('id="prof-form-card"'));
  ok(/Couldn&rsquo;t reach your account/.test(card), 'says what happened');
  ok(/Your profile is on file/.test(card), 'and that the profile is not lost');
  ok(/would replace the one you have/.test(card), 'warns against creating a second account, which is the damage');
  ok(/Try Again/.test(card), 'offers a retry');
  ok(/doLogout\(\)/.test(card), 'and a way out');
  ok(/display:none/.test(card.slice(0,200)), 'and is hidden until it is needed');
}

console.log('The 405 on the picker');
{
  const p=html.slice(html.indexOf('async function proxyCall('));
  const body=p.slice(0, p.indexOf('\nfunction fileToB64'));
  ok(/r\.status===404\|\|r\.status===405/.test(body), 'a 404 or 405 is recognised');
  ok((body.match(/!\(d&&d\.error\)/g)||[]).length===2,
     'only when the body carries no error of its own — the function says "Method not allowed" in JSON, the CDN says nothing — '
     +'and that qualification is on both the retry and the message, or a real 405 from the function would be mislabelled');
  ok(/i<3/.test(body), 'and is retried');
  ok(/could not reach its server/.test(body), 'then reported in words rather than as "Proxy error 405"');
  ok(/being published this clears in a minute/.test(body), 'naming the likely reason');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-profilefail.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
