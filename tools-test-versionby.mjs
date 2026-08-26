// A version entry used to carry one string that was sometimes a person and
// sometimes a firm, so a reader could not tell which they were looking at.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.vb.tmp.mjs', [
  grab('function rowCompany'), grab('function _versions'),
  "export { _versions };"
].join('\n'));
const { _versions } = await import('./.vb.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('Stored history is respected');
let h=_versions({'Version History':JSON.stringify([
  {v:1, by:'David Chen', co:'Summit Builders', note:'Submitted'},
  {v:2, by:'Sarah Draper', co:'Draper & Associates', note:'Answered'}])});
ok('both entries survive',        h.length===2);
ok('the person is kept',          h[0].by==='David Chen');
ok('the firm is kept',            h[0].co==='Summit Builders');

console.log('"Name (Company)" is split apart');
// Some rows record the submitter as one combined string.
h=_versions({'Version History':JSON.stringify([{v:1, by:'David Chen (Summit Builders)'}])});
ok('the person is extracted',     h[0].by==='David Chen');
ok('the firm is extracted',       h[0].co==='Summit Builders');
h=_versions({'Version History':JSON.stringify([{v:1, by:'Guy Gardner  (Big Bear Construction)  '}])});
ok('spacing does not matter',     h[0].by==='Guy Gardner' && h[0].co==='Big Bear Construction');

console.log('Entries that already carry both are left alone');
h=_versions({'Version History':JSON.stringify([{v:1, by:'David Chen (Summit)', co:'Comfort Systems'}])});
ok('an existing firm is not overwritten', h[0].co==='Comfort Systems');
ok('and the name is left as recorded',    h[0].by==='David Chen (Summit)');

console.log('Plain values are untouched');
for(const v of ['Summit Builders','David Chen','']){
  h=_versions({'Version History':JSON.stringify([{v:1, by:v}])});
  ok('leaves '+(v||'an empty value')+' as it is', h[0].by===v);
}
h=_versions({'Version History':JSON.stringify([{v:1}])});
ok('an entry with no author does not gain one', !h[0].by && !h[0].co);

console.log('Rows with no stored history');
h=_versions({'Submitted By':'David Chen', 'Company':'Summit Builders', 'Status':'Open'});
ok('a single entry is synthesised', h.length===1);
ok('it names the person',          h[0].by==='David Chen');
ok('it names the firm',            h[0].co==='Summit Builders');
h=_versions({'Submitted By (Sub)':'Comfort Systems', 'Contractor':'Comfort Systems'});
ok('person and firm the same still resolves', h[0].by==='Comfort Systems' && h[0].co==='Comfort Systems');

console.log('Rendering');
const rowfn=src.slice(src.indexOf('function verThreadRows'), src.indexOf('function verThreadRows')+1800);
ok('the person is emphasised',     /v\.by\?' &middot; <strong/.test(rowfn));
ok('the firm is shown muted',      /v\.co && String\(v\.co\)/.test(rowfn));
ok('a firm equal to the name is not repeated',
   /toLowerCase\(\)!==String\(v\.by\|\|''\)\.trim\(\)\.toLowerCase\(\)/.test(rowfn));

console.log('Replies record both');
const sub=src.slice(src.indexOf('let by=\'\', co=\'\';'), src.indexOf('row[\'Version History\']=JSON.stringify(vs);'));
ok('the person comes from the profile', /resolveMe\(\)/.test(sub));
ok('the firm is captured too',          /co=me\.company/.test(sub));
ok('there is a fallback if that fails', /catch\(e\)\{[\s\S]*getUser\(\)/.test(sub));
ok('both are written to the entry',     /by:by, co:co/.test(src));

fs.rmSync('.vb.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
