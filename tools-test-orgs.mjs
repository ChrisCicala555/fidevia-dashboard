// A company existed only as free text on each person, so "Summit Builders" and
// "Summit Builders LLC" were different firms and neither had an address. These
// are the records that fix that, and the checks that stop an incomplete one
// reaching a formal document.
import fs from 'fs';
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(s,sig)=>{ const i=s.indexOf(sig); let d=0,on=false,j=i;
  for(;j<s.length;j++){ if(s[j]==='{'){d++;on=true;} else if(s[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return s.slice(i,j); };

fs.writeFileSync('.og.tmp.mjs', [
  proxy.slice(proxy.indexOf('const companyKey'), proxy.indexOf('function companyComplete')),
  grab(proxy,'function companyComplete'),
  "export { companyKey, companyComplete, COMPANY_CATEGORIES };"
].join('\n'));
const { companyKey, companyComplete, COMPANY_CATEGORIES } = await import('./.og.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('One firm, one record');
ok('casing does not split a firm',    companyKey('Summit Builders')===companyKey('summit builders'));
ok('padding does not split a firm',   companyKey('  Summit Builders ')===companyKey('Summit Builders'));
ok('extra spacing does not either',   companyKey('Summit  Builders')===companyKey('Summit Builders'));
ok('punctuation is ignored',          companyKey('Draper & Assoc.')===companyKey('Draper & Assoc'));
ok('commas are ignored',              companyKey('Acme, LLC')===companyKey('Acme LLC'));
// Deliberately still distinct: these are plausibly different legal entities.
ok('a suffix still distinguishes',    companyKey('Summit Builders')!==companyKey('Summit Builders LLC'));
ok('blank is safe',                   companyKey('')==='' && companyKey(null)==='');

console.log('An address is complete only when it can be posted');
const full={line1:'124 West Church St', city:'Dillsburg', state:'PA', zip:'17019'};
ok('a full address is complete',      companyComplete(full)===true);
for(const k of ['line1','city','state','zip']){
  const partial=Object.assign({}, full); delete partial[k];
  ok('missing '+k+' is incomplete',   companyComplete(partial)===false);
}
ok('whitespace does not count',       companyComplete({line1:'  ',city:'x',state:'y',zip:'z'})===false);
ok('line 2 is not required',          companyComplete(full)===true);
ok('an empty record is incomplete',   companyComplete({})===false);
ok('a null record is incomplete',     companyComplete(null)===false);

console.log('Categories');
ok('the five categories exist', COMPANY_CATEGORIES.join()==='architect,engineer,contractor,owner,other');

console.log('Server');
const list=proxy.slice(proxy.indexOf("op === 'listCompanies'"), proxy.indexOf("op === 'saveCompany'"));
ok('listing is admin only',            /if \(!who\.isAdmin\) return json/.test(list));
ok('it discovers firms from people',   /store\.get\(b\.key, \{ type: 'json' \}\)[\s\S]{0,200}pr\.company/.test(list));
ok('it merges saved records with discovered names', /new Set\(\[\.\.\.Object\.keys\(saved\), \.\.\.seen\.keys\(\)\]\)/.test(list));
ok('it reports completeness',          /complete: companyComplete\(rec\)/.test(list));
const save=proxy.slice(proxy.indexOf("op === 'saveCompany'"), proxy.indexOf("op === 'allContacts'"));
ok('saving is admin only',             /if \(!who\.isAdmin\) return json/.test(save));
ok('an unknown category is discarded', /COMPANY_CATEGORIES\.includes\(cat\) \? cat : ''/.test(save));
ok('a partial save keeps prior values',/prev\.line1 \|\| ''/.test(save));
ok('fields are length-capped',         /\.slice\(0, 200\)/.test(save));

console.log('Client');
ok('there is an Organizations tab',    html.includes(">Organizations "));
ok('the tab carries a count',          html.includes('id="cd-org-badge"'));
ok('incomplete firms sort first',      /orgIncomplete\(b\)-orgIncomplete\(a\)/.test(src));
// Styled as the Directory is: one card, a table, bands per group.
ok('it renders as a directory table',  /box\.innerHTML='<div class="cd-card"><table>/.test(src));
ok('groups use the same band markup',  /rows\+='<tr class="cd-band">/.test(src));
ok('rows open the record',             /onclick="rowActivate\(event,\(\)=>openOrg/.test(src));
ok('the old card layout is gone',      !/class="org-card/.test(src));
// Fidevia and Fidevia LLC. sit next to each other; say so where they are seen.
ok('likely duplicates are flagged in the list', /Possibly the same firm as/.test(src));
ok('the twin check ignores case',      /toLowerCase\(\)\.trim\(\)/.test(grab(src,'function orgLikelyTwin')));
ok('a firm is not its own twin',       /if\(x\.key===o\.key\) return false/.test(grab(src,'function orgLikelyTwin')));
// Fidevia was prepended to the grouping, so the disciplines now follow it.
ok('groups follow the five categories',/\['architect','Architects'\],\['engineer','Engineers'\],\n?\s*\['contractor','Contractors'\]/.test(src));
ok('uncategorised firms still appear', /\['','Uncategorised'\]/.test(src));
ok('a project notice lists the gaps',  html.includes('id="org-gap-note"'));
ok('the notice is admin only',         /id="org-gap-note" class="admin-only"/.test(html));
ok('the notice links to the directory',/cdTab\(\\?'orgs\\?'\)/.test(src));

console.log('The generator will refuse rather than print a blank');
const rd=grab(src,'function coDocumentReadiness');
ok('it checks the contractor',         /\['Contractor',companyName\]/.test(rd));
ok('it checks the owner',              /\['Owner',/.test(rd));
ok('it names what is missing',         /need\.push\(nm\+' has no address on file'\)/.test(rd));
ok('it catches a party not recorded at all', /is not recorded on this project/.test(rd));
ok('it reports ready only when nothing is missing', /ready:!need\.length/.test(rd));


console.log('Merging one spelling into another');
const mg=proxy.slice(proxy.indexOf("op === 'mergeCompany'"), proxy.indexOf("op === 'allContacts'"));
ok('is admin only',                    /if \(!who\.isAdmin\) return json/.test(mg));
ok('both names are required',          /if \(!fromName \|\| !toName\) return json/.test(mg));
ok('merging a firm into itself is refused', /if \(fk === tk\) return json/.test(mg));
ok('it can preview without changing anything', /const dryRun = !!body\.dryRun;/.test(mg));
ok('a preview writes no profile',      /if \(!dryRun\) \{ pr\.company = toName; await pstore\.setJSON/.test(mg));
ok('a preview writes no grant',        /if \(!dryRun\) p\.company = toName;/.test(mg));
ok('it moves people',                  /pr\.company = toName/.test(mg));
// The part that actually matters: a grant holds the company that decides which
// rows a contractor sees, so leaving it behind would empty their project.
ok('it moves access grants too',       /companyKey\(p\.company\) === fk/.test(mg));
ok('it reports who is affected',       /people, grants: grantsTouched\.length/.test(mg));
ok('it keeps an address rather than losing one', /if \(src && !companyComplete\(dst\)\)/.test(mg));
ok('the old name is removed',          /companyStore\(\)\.delete\(fk\)/.test(mg));
ok('matching ignores spelling drift',  /companyKey\(pr\.company\) === fk/.test(mg));

console.log('And it asks first');
const mo=grab(src,'async function mergeOrg');
ok('it previews before acting',        /dryRun:true/.test(mo));
ok('it names the people affected',     /names\.slice\(0,8\)/.test(mo));
ok('it says how many grants move',     /access '\+\(pre\.grants===1\?'grant':'grants'\)/.test(mo));
ok('it warns the name is removed',     /will then be removed\. This cannot be undone/.test(mo));
ok('declining stops it',               /if\(!confirm\(lines\.join/.test(mo));
ok('near-matching names are offered first', /a\.startsWith\(b\)\|\|b\.startsWith\(a\)/.test(src));
ok('the button stays disabled until a target is chosen', /b\.disabled=!sel\.value/.test(src));


console.log('Fidevia is not a discipline');
ok('recognised by the people under it, not the spelling',
   /String\(\(pr && pr\.email\) \|\| ''\)[\s\S]{0,60}endsWith\(FIDEVIA_DOMAIN\)/.test(proxy));
ok('the plain name is recognised too',   /fidevia\.has\(k\) \|\| k === 'fidevia'/.test(proxy));
ok('its category is forced',             /isFidevia \? 'fidevia'/.test(proxy));
ok('it is not one of the choosable categories',
   !COMPANY_CATEGORIES.includes('fidevia'));
ok('it leads the grouping',              /const ORG_CATS=\[\['fidevia','Fidevia'\]/.test(src));
ok('the picker is disabled for it',      /catSel\.disabled=true/.test(src));
ok('and explains why',                   /construction manager on every project, so this is not a choice/.test(src));
ok('the picker is re-enabled for everyone else', /catSel\.disabled=false/.test(src));
// It still needs an address: the change order names the construction manager.
ok('an address is still required',       /An address is still needed/.test(src));
ok('it never reads as uncategorised',    /o\.isFidevia\s*\?\s*'<span style="color:var\(--olive-700\)/.test(src));
ok('another spelling can still be merged into it', /const others=ORGS\.filter\(x=>x\.key!==key\);/.test(src));


console.log('A merge that did not fully take says so');
ok('the server re-checks afterwards',   /let remaining = \[\];/.test(mg));
ok('it looks for profiles still on the old name', /companyKey\(pr\.company\) === fk\) remaining\.push/.test(mg));
ok('it clears a leftover record with no people', /if \(await companyStore\(\)\.get\(fk[\s\S]{0,60}delete\(fk\)/.test(mg));
ok('it reports what is left',           /remaining \}\);/.test(mg));
ok('the check is skipped on a preview', /if \(!dryRun\) \{\s*try \{\s*const \{ blobs \} = await pstore\.list/.test(mg));
const mo2=grab(src,'async function mergeOrg');
ok('the client does not claim success when profiles remain',
   /if\(\(res\.remaining\|\|\[\]\)\.length\)\{/.test(mo2));
ok('it names which profiles to correct', /res\.remaining\.slice\(0,3\)/.test(mo2));
ok('it reloads before judging',         mo2.indexOf('await loadOrgs()') < mo2.indexOf('res.remaining'));

fs.rmSync('.og.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
