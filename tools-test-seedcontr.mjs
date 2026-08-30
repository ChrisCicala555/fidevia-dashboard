// The contractors step fills itself from the team step.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/if\(WIZ_STEP===4\) wizSeedContractors\(\);/.test(html), 'it runs on arriving at the contractors step');
ok(/function wizSeedContractors/.test(html), 'the seeder exists');

const fn = html.split('function wizSeedContractors')[1].split('function wizSeedNote')[0];
ok(/c\._access!=='contractor'/.test(fn), 'only people given Contractor access count');
ok(/have\.has\(norm\(co\)\)/.test(fn), 'a company already listed is not added again');
ok(/wanted\.some\(w=>norm\(w\)===norm\(co\)\)/.test(fn), 'two people from one firm add it once');
ok(/find\(r=>!String\(r\.querySelector\('\.cn-name'\)\.value\|\|''\)\.trim\(\)\)/.test(fn),
   'the blank starter row is used before a new one is added');
ok(!/remove\(\)/.test(fn) && !/innerHTML=''/.test(fn),
   'nothing existing is removed — a row may already carry a contract amount');
ok(!/cn-contract/.test(fn), 'the contract amount is never written, since it is not known here');

// the matching, run for real
{
  const norm=v=>String(v||'').trim().toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ');
  ok(norm('Summit Builders')===norm('summit  builders'), 'spacing and case do not create a duplicate');
  ok(norm('Summit Builders, LLC')===norm('Summit Builders LLC'), 'punctuation does not either');
  ok(norm('Summit Builders')!==norm('Summit Building'), 'genuinely different names stay different');

  const seed=(contacts, existing)=>{
    const have=new Set(existing.map(norm).filter(Boolean));
    const wanted=[];
    contacts.forEach(c=>{
      if(c._access!=='contractor') return;
      const co=String(c.Company||'').trim();
      if(!co || have.has(norm(co)) || wanted.some(w=>norm(w)===norm(co))) return;
      wanted.push(co);
    });
    return wanted;
  };
  const team=[
    {Company:'Summit Builders', _access:'contractor'},
    {Company:'Summit Builders', _access:'contractor'},   // second person, same firm
    {Company:'Gorilla Construction', _access:'contractor'},
    {Company:'Draper & Associates', _access:'architect'},
    {Company:'Lincoln School District', _access:'owner'},
    {Company:'Fidevia', _access:''},
    {Company:'', _access:'contractor'}                   // no company
  ];
  ok(JSON.stringify(seed(team,[]))==='["Summit Builders","Gorilla Construction"]',
     'only contractor companies, once each (got '+JSON.stringify(seed(team,[]))+')');
  ok(seed(team,['Summit Builders']).length===1, 'one already listed leaves one to add');
  ok(seed(team,['summit builders, llc']).length===2,
     'a differently punctuated existing name is a different firm, so it is still added');
  ok(seed(team,['Summit Builders','Gorilla Construction']).length===0, 'nothing to add when both are there');
  ok(seed([],[]).length===0, 'an empty team adds nothing');
  ok(seed([{Company:'X', _access:'engineer'}],[]).length===0, 'an engineer is not a prime contractor');
}

const note = html.split('function wizSeedNote')[1].split('function wizGatherContractors')[0];
ok(/Fill in the contract amount/.test(note), 'the note says what still needs doing');
ok(/n===1 \?/.test(note), 'it reads correctly for one company');
ok(/: '';/.test(note), 'and says nothing when nothing was added');

console.log((bad?'FAIL ':'ok   ')+'tools-test-seedcontr.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
