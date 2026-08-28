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
ok('groups follow the five categories',/\['architect','Architects'\],\['engineer','Engineers'\],\['contractor','Contractors'\]/.test(src));
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

fs.rmSync('.og.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
