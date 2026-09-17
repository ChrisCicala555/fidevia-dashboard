// A version entry used to carry one string that was sometimes a person and
// sometimes a firm, so a reader could not tell which they were looking at.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
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
ok('the firm is shown muted',      /verShowsCo\(v\.by, v\.co\) \? ' <span style="color:var\(--muted\);">/.test(rowfn));
// Not just an exact match: a submitter recorded as "address (Firm)" is neither
// equal to the firm nor free of it, and was given it a second time.
ok('a firm already in the name is not repeated',
   /return b\.toLowerCase\(\)\.indexOf\(c\.toLowerCase\(\)\)<0;/.test(src));

console.log('Replies record both');
// Anchored forwards from the reply itself. The end marker is a line that also
// appears in removeVersionFile, which is earlier in the file, so searching for
// it from the start now lands before this block begins.
const _subStart=src.indexOf('let by=\'\', co=\'\';');
const sub=src.slice(_subStart, src.indexOf('row[\'Version History\']=JSON.stringify(vs);', _subStart));
ok('the person comes from the profile', /resolveMe\(\)/.test(sub));
ok('the firm is captured too',          /co=me\.company/.test(sub));
ok('there is a fallback if that fails', /catch\(e\)\{[\s\S]*getUser\(\)/.test(sub));
ok('both are written to the entry',     /by:by, co:co/.test(src));

fs.rmSync('.vb.tmp.mjs',{force:true});
console.log('The log reads by company')
{
  // "Can we put contractor/submitting company on top - and then the email below
  // in lighter and smaller text?" It was the other way round, and the stored
  // value is often "address (Firm)" — so the firm was printed inside brackets
  // on the first line and again on the second, and the address took the
  // emphasis in a column whose question is whose submittal this is.
  const P=bootPage('index.html'); P.run(SEED);
  P.run(`allData.contacts=[{'Name':'Dave Chen','Company':'Summit Builders','Email':'d@s.test'}];`);
  const cell=(row)=>P.run(`submitterCell(${JSON.stringify(row)})`);

  const c=cell({'Submitted By (Sub)':'theintergalacticinvestments@gmail.com (Summit Builders)',
                'Company':'Summit Builders'});
  ok('the firm comes first \u2014 '+c.replace(/<[^>]+>/g,' ').trim(),
     c.indexOf('Summit Builders')<c.indexOf('@'));
  ok('and the address sits under it in the muted second line',
     /class="cell-sub">theintergalacticinvestments@gmail\.com</.test(c));
  ok('said once: the bracketed copy on the old first line is gone',
     (c.match(/Summit Builders/g)||[]).length===1);

  ok('an address the directory knows by name is shown as the name, which is what the rest of the '
     +'project calls them',
     /class="cell-sub">Dave Chen</.test(cell({'Submitted By':'d@s.test','Company':'Summit Builders'})));
  const same=cell({'Submitted By':'Summit Builders','Company':'Summit Builders'});
  ok('a firm that filed under its own name is not repeated under itself', !/cell-sub/.test(same));
  const nocо=cell({'Submitted By':'Dave Chen'});
  ok('and with no firm recorded, the person stands alone rather than over an empty line',
     /Dave Chen/.test(nocо) && !/cell-sub/.test(nocо));
  ok('an empty cell reads as a dash rather than as nothing at all', /—/.test(cell({})));

  ok('used by the RFI, change order and submittal logs alike \u2014 one cell, so they cannot drift',
     (html.match(/\+submitterCell\(r\)\+/g)||[]).length===3);
  ok('and none of them builds its own any more', !/twoLine\(r\['Submitted By/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
