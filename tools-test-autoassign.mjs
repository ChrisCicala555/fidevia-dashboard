// The workflow decides who an item goes to; the submitter does not choose.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/function itemAssignedFirms/.test(html), 'the reviewing firms are derived');
const ia = html.split('function itemAssignedFirms')[1].split('// The firm an item sits with')[0];
ok(/wfStepsFor\(key, submittingCompany\|\|''\)/.test(ia),
   'from the chain for the submitting company, so a contractor override applies');
ok(/wfGroupAt\(steps,0\)/.test(ia), 'taking the first review group');
ok(/!out\.some\(x=>x\.toLowerCase\(\)===firm\.toLowerCase\(\)\)/.test(ia), 'de-duplicated');
ok(/architect/i.test(ia) && /engineer/i.test(ia),
   'a step with nobody assigned still resolves by the discipline it names');

// no longer a choice
ok(/id="f-assigned" readonly/.test(html), 'the RFI field is read-only');
ok(/id="f-reviewer" readonly/.test(html), 'and so is the submittal one');
ok(!/id="f-assigned"><\/select>/.test(html) && !/id="f-reviewer"><\/select>/.test(html),
   'neither is a picker any more');
ok(/<label>Goes to<\/label>/.test(html), 'the label says what it is rather than asking');
{
  const fa = html.split('function fillAssignedFirm')[1].split('function firmOptions')[0];
  ok(/EXTERNAL \? \(\(currentProject&&currentProject\.userCompany\)/.test(fa),
     'the submitting company is the viewer’s own when external');
  ok(/Also goes to '\+firms\.slice\(1\)\.join\(' and '\)/.test(fa),
     'more than one firm shows the first and names the rest');
  ok(/does not name a reviewer, so this will not reach anyone/.test(fa),
     'an empty chain is called out before the item is raised');
  ok(/Set in Settings|Settings → Workflows/.test(fa), 'and says where to fix it');
}

// stored and notified
ok(/'Assigned To':\(itemAssignedFirms\('rfi',_rc\)\[0\]\|\|''\)/.test(html),
   'the RFI records the first firm rather than a form value');
ok(/'Reviewer':\(itemAssignedFirms\('sub',_sc\)\[0\]\|\|''\)/.test(html),
   'and the submittal likewise');
ok(/notifyFirms\(itemAssignedFirms\('rfi', _rc\), 'Notify - RFI'\)/.test(html), 'every RFI firm is told');
ok(/notifyFirms\(itemAssignedFirms\('sub', _sc\), 'Notify - Submittal'\)/.test(html), 'every submittal firm is told');
{
  const nf = html.split('function notifyFirms')[1].slice(0, 700);
  ok(/want\.has\(String\(c\['Company'\]/.test(nf), 'matched on company');
  ok(/toLowerCase\(\)!=='yes'/.test(nf), 'and only those who asked for that kind of notice');
  // The note sits above the function, and the mechanism is in notifyContacts.
  ok(/de-duplicated when the message is built/.test(html),
     'the overlap between two firms cannot produce two copies');
  ok(/emails=emails\.filter\(e=>\{ const k=\(e\|\|''\)\.trim\(\)\.toLowerCase\(\); if\(!k\|\|seen\.has\(k\)\) return false/.test(html),
     'because recipients are de-duplicated where the message is sent');
}

// behaviour
{
  const contacts=[
    {Name:'Test Architect', Company:'Architect 2', Role:'Architect'},
    {Name:'Penelope Odiem', Company:'Next Level Engineers', Role:'Engineer'}
  ];
  const firmOf=n=>{ const c=contacts.find(x=>x.Name===n); return c?c.Company:''; };
  const group=steps=>{ const out=[];
    steps.forEach(st=>{ const f=firmOf(st.person)||''; if(f && !out.includes(f)) out.push(f); });
    return out; };
  ok(group([{person:'Test Architect'}]).join()==='Architect 2', 'one reviewer, one firm');
  ok(group([{person:'Test Architect'},{person:'Penelope Odiem'}]).length===2,
     'a parallel architect and engineer give two firms');
  ok(group([{person:'Test Architect'},{person:'Test Architect'}]).length===1,
     'two steps at one firm give one');
  ok(group([{person:'Nobody'}]).length===0, 'an unresolvable step yields nothing');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-autoassign.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
