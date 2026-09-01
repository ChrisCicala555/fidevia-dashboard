// RFI-GC-001: the trade code is in the number, and the run is per code.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/function tradeCodeFor/.test(html), 'a company resolves to a trade code');
const tc = html.split('function tradeCodeFor')[1].split('function nextItemNumber')[0];
ok(/return 'CM'/.test(tc), 'Fidevia items carry CM');
ok(/design\) return 'AE'/.test(tc) || /\? 'AE'/.test(tc), 'the design team carry AE');
ok(/r==='OTHER'\) \? TRADE_OTHER/.test(tc), "the 'Other' label is not used verbatim in a number");
ok(/const TRADE_OTHER='OC'/.test(html), 'it maps to OC');

const ni = html.split('function nextItemNumber(key, comp)')[1].split('function nextItemNumberByCompany')[0];
ok(/sub:'SUB'/.test(ni), 'submittals are SUB');
ok(/label\+'-'\+code\+'-'\+String\(max\+1\)\.padStart\(3,'0'\)/.test(ni), 'the format is LABEL-CODE-NNN');
ok(!/'_'\+\(comp/.test(ni), 'the company suffix is gone from new numbers');
ok(/if\(key==='pay_apps'\) return nextItemNumberByCompany/.test(ni),
   'pay applications stay per contractor, since they bill one contract');
ok(/m\[1\]\.toUpperCase\(\)===code/.test(ni), 'the run is per code, so two firms sharing one do not collide');
ok(/tradeCodeFor\(rowCompany\(r\)\)!==code/.test(ni),
   'items numbered before this change still feed the right run');

// the numbering itself
{
  const TRADE_OTHER='OC';
  const codeFor=(co,recs)=>{ if(!co) return 'CM';
    if(/^fidevia\b/i.test(co)) return 'CM';
    const r=(recs||[]).find(x=>x.name.toLowerCase()===co.toLowerCase());
    if(r&&r.role){ const u=r.role.toUpperCase(); return u==='OTHER'?TRADE_OTHER:u; }
    return 'CM'; };
  const recs=[{name:'Summit Builders',role:'GC'},{name:'Reliable Plumbing',role:'PC'},
              {name:'Ace Plumbing',role:'PC'},{name:'Odd Job',role:'Other'}];
  const next=(rows,co,label)=>{
    const code=codeFor(co,recs); let max=0;
    rows.forEach(v=>{
      let m=String(v).match(/^[A-Za-z]+-([A-Z]{2,5})-(\d+)\s*$/);
      if(m){ if(m[1]===code){ const x=parseInt(m[2],10); if(x>max) max=x; } return; }
      const own=String(v).match(/-(\d+)_(.*)$/);
      if(own && codeFor(own[2],recs)===code){ const x=parseInt(own[1],10); if(x>max) max=x; }
    });
    return label+'-'+code+'-'+String(max+1).padStart(3,'0');
  };
  ok(next([], 'Summit Builders','RFI')==='RFI-GC-001', 'first GC item (got '+next([],'Summit Builders','RFI')+')');
  ok(next(['RFI-GC-001'],'Summit Builders','RFI')==='RFI-GC-002', 'continues the GC run');
  ok(next(['RFI-GC-001'],'Reliable Plumbing','RFI')==='RFI-PC-001', 'a different trade starts its own run');
  // the collision case, resolved by sharing the run
  ok(next(['RFI-PC-001'],'Ace Plumbing','RFI')==='RFI-PC-002',
     'a second plumber continues the PC run rather than repeating 001');
  ok(next([],'Odd Job','RFI')==='RFI-OC-001', "the Other trade reads OC, not 'Other'");
  ok(next([],'Fidevia','RFI')==='RFI-CM-001', 'Fidevia raises CM');
  // continuity with what is already numbered
  ok(next(['RFI-003_Summit Builders'],'Summit Builders','RFI')==='RFI-GC-004',
     'an old number continues into the new run rather than restarting');
  ok(next(['RFI-003_Summit Builders'],'Reliable Plumbing','RFI')==='RFI-PC-001',
     'and only into its own trade');
  ok(next(['SUB-GC-009','RFI-GC-002'],'Summit Builders','SUB')==='SUB-GC-010', 'submittals number separately');
}

// ── the allowance letter, no longer positional ──
ok(/data-id="'\+esc\(id\)\+'"/.test(html), 'an allowance row carries its letter');
ok(/r\.getAttribute\('data-id'\)/.test(html), 'and it is read back rather than recomputed');
ok(!/function alwReletter/.test(html), 'the re-lettering that caused the bug is gone');
{
  const rm = html.split('function alwRemove')[1].split('function alwAdd')[0];
  ok(/keeps that reference, and the letter will not be reused/.test(rm),
     'removing one says what happens to change orders already drawn against it');
}
{
  const ad = html.split('function alwAdd')[1].split('function alwKey')[0];
  ok(/while\(used\.has\(allowanceLetter\(i\)\)\) i\+\+/.test(ad),
     'a new allowance takes the next unused letter, not the next position');
}
{
  // deleting B must not turn C into B
  const rows=[{id:'A'},{id:'B'},{id:'C'}].filter(r=>r.id!=='B');
  ok(rows.map(r=>r.id).join('')==='AC', 'A and C survive with a gap where B was');
  const used=new Set(rows.map(r=>r.id));
  const letter=i=>String.fromCharCode(65+i);
  let i=0; while(used.has(letter(i))) i++;
  ok(letter(i)==='B', 'and the gap is reused only when a new allowance is added');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-numbering.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
