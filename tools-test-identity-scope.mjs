// Who you are on a project is decided by that project's grant, not by your
// global profile. The same person is legitimately a different company on
// different jobs — a contractor for Summit on one, for Big Bear on another.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

console.log('Company precedence');
const me=grab('async function resolveMe');
// The bug: this used to sit inside `if(!ME_COMPANY)`, so a cached value from a
// previous project won and the grant was never consulted.
ok('the grant is applied unconditionally, not only when blank',
   /if\(EXTERNAL && currentProject && currentProject\.userCompany\)\{\s*ME_COMPANY = currentProject\.userCompany;/.test(me));
ok('the grant branch comes before any fallback',
   me.indexOf('currentProject.userCompany') < me.indexOf('allData.contacts'));
ok('the cached profile no longer sets the company up front',
   !/if\(p\.company\) ME_COMPANY=p\.company;/.test(me));
ok('the cached profile is still a last resort',
   /else \{ try\{[\s\S]*localStorage[\s\S]*p\.company/.test(me));
ok('Fidevia staff still resolve to Fidevia', /ME_COMPANY='Fidevia'/.test(me));
ok('the profile name is still preferred over the Auth0 name', /if\(full\) ME_NAME=full;/.test(me));

console.log('Cached identity is cleared between projects');
ok('there is a reset', /function clearMe\(\)\{ ME_COMPANY=''; \}/.test(src));
ok('it runs when a project opens', /try\{ clearMe\(\); \}catch\(e\)\{\}/.test(src));
ok('it runs after the grant is read',
   src.indexOf('currentProject.userRole||\'contractor\'') < src.indexOf('try{ clearMe(); }catch(e){}'));

console.log('The profile cache refreshes');
// It was only fetched when nothing was stored, so once written it never changed.
ok('the server is always consulted', !/if\(!localProf\)\{\s*try\{\s*const tok/.test(src));
ok('the fetch is unconditional', /\/\/ Always ask the server[\s\S]{0,600}await fetch\('\/api\/profile'/.test(src));
ok('the local copy is still a fallback on failure', /catch\(e\)\{\}\s*\n\s*if\(!meta\.onboarded/.test(src));

console.log('A company change offers to move the grants');
const off=grab('async function cdOfferGrantUpdate');
ok('it reads the existing grants',        /adminListGrants/.test(off));
ok('it only lists grants on another firm',/String\(p\.company\|\|''\)\.trim\(\)\.toLowerCase\(\)!==co\.toLowerCase\(\)/.test(off));
ok('it does nothing when all agree',      /if\(!stale\.length\) return;/.test(off));
ok('it names each project and its current company', /currently '\+\(p\.company/.test(off));
ok('it asks rather than sweeping',        /confirm\(/.test(off));
ok('declining changes nothing',           /\) return;\s*\n\s*for\(const p of stale\)/.test(off));
ok('it preserves the role on each grant', /role:p\.role\|\|'contractor'/.test(off));
ok('it explains why it matters',          /decides which financial records/.test(off));
ok('it is triggered by a company edit',   /CD_DIRTY\[sub\]\.company!==undefined/.test(src));
// `let CD_DIRTY={}` is the declaration, not the reset — anchor inside cdSave.
const save=grab('async function saveContactDirectory');
ok('the trigger list is captured before the dirty list is cleared',
   save.indexOf('const movedCompany=subs.filter') < save.indexOf('CD_DIRTY={};'));
ok('the grants are offered before the dirty list is cleared',
   save.indexOf('cdOfferGrantUpdate') < save.indexOf('CD_DIRTY={};'));
ok('the offer runs only after every save succeeded',
   save.indexOf('if(failed.length)') < save.indexOf('cdOfferGrantUpdate'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
