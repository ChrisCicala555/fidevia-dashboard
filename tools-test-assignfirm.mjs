// RFIs are assigned to a firm; the turnaround comes from the workflow.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/function projectFirms/.test(html) && /function firmOptions/.test(html) && /function assignedFirm/.test(html),
   'the firm helpers exist');
{
  const pf = html.split('function projectFirms')[1].split('function firmOptions')[0];
  ok(/allData\.contacts/.test(pf) && /config\.contractors/.test(pf),
     'the list covers contacts and contractors');
  ok(/c\.active!==false/.test(pf), 'an inactive contractor is not offered');
  ok(/seen\.has\(co\.toLowerCase\(\)\)/.test(pf), 'and it is de-duplicated');
}
{
  const af = html.split('function assignedFirm')[1].split('function disciplineOf')[0];
  ok(/projectFirms\(\)\.some/.test(af), 'a value that is already a firm is returned as is');
  ok(/firmOf\(t\)/.test(af), 'a person resolves through their company');
  ok(/return viaPerson \|\| t/.test(af), 'and an unknown value is left alone rather than blanked');
}
ok(/Nothing is rewritten — the old\s*\n\/\/ value keeps working/.test(html) || /Nothing is rewritten/.test(html),
   'the migration approach is recorded: read tolerantly, rewrite nothing');

// the form
// The field no longer asks — the workflow decides and this reports it.
ok(/id="f-assigned" readonly/.test(html), 'the field reports rather than asks');
ok(/fillAssignedFirm\('rfi','f-assigned'\)/.test(html), 'and is filled from the chain');
ok(/Set by the workflow, from who reviews first/.test(html), 'it says where the answer came from');

// due date from the workflow
ok(/function rfiDueDaysFromWorkflow/.test(html), 'the turnaround comes from the chain');
{
  const dw = html.split('function rfiDueDaysFromWorkflow')[1].split('function rfiDueDays\\(')[0];
  ok(/wfStepsFor\('rfi',''\)/.test(dw), 'it reads the RFI chain');
  ok(/return d\.architect;/.test(dw), 'and falls back to the architect period');
  ok(/engineer/i.test(dw) && /architect/i.test(dw), 'a step named for a discipline counts even with nobody assigned');
}
ok(/addDays\(etToday\(\), rfiDueDaysFromWorkflow\(\)\)/.test(html),
   'the contract due date no longer depends on who it was pointed at');

// notification
{
  const cp = html.split('async function submitForm')[1] || html;
  ok(/notifyFirms\(itemAssignedFirms\('rfi', _rc\), 'Notify - RFI'\)/.test(html),
     'every firm on the first review step is notified');
  ok(/c\[notifyField\]\|\|''\)\.toLowerCase\(\)!=='yes'/.test(html),
     'and only people who asked for that kind of notice');
  // Submittals still name an individual Reviewer — a separate field, left as
  // it was. Only the RFI path changed.
  ok(!/newRow\['Assigned To'\]\|\|''\)\.trim\(\)\)/.test(html),
     'the RFI no longer notifies one named person');
  ok(/newRow\['Reviewer'\]/.test(html), 'the submittal Reviewer is untouched');
}

// attention and display
ok(/const firm=assignedFirm\(r\['Assigned To'\]\)/.test(html), 'the attention panel resolves the firm');
ok(/badge:'Assigned to '\+firm/.test(html), 'and says which firm');
ok(/const withUs=\(assignedFirm\(r\['Assigned To'\]\)\.trim\(\)\.toLowerCase\(\)===myCo\)/.test(html),
   'workflow attention matches on firm too');
ok(/esc\(assignedFirm\(r\['Assigned To'\]\)\)/.test(html), 'the table shows the firm');
ok(/raw\.toLowerCase\(\)!==f\.toLowerCase\(\)\) \? twoLine\(f, raw\)/.test(html),
   'a row that named a person keeps the name under the firm');

// behaviour
{
  const contacts=[
    {Name:'Sarah Draper', Company:'Draper & Associates'},
    {Name:'Penelope Odiem', Company:'Next Level Engineers'}
  ];
  const firms=['Draper & Associates','Next Level Engineers','Summit Builders'];
  const firmOf=n=>{ const c=contacts.find(x=>x.Name.toLowerCase()===String(n||'').trim().toLowerCase()); return c?c.Company:''; };
  const resolve=v=>{ const t=String(v||'').trim(); if(!t) return '';
    if(firms.some(f=>f.toLowerCase()===t.toLowerCase())) return t;
    return firmOf(t)||t; };
  ok(resolve('Draper & Associates')==='Draper & Associates', 'a firm stays a firm');
  ok(resolve('Sarah Draper')==='Draper & Associates', 'an old row naming a person reads as their firm');
  ok(resolve('Penelope Odiem')==='Next Level Engineers', 'and so does the engineer');
  ok(resolve('Someone Gone')==='Someone Gone', 'an unrecognised name is shown rather than lost');
  ok(resolve('')==='', 'nothing assigned stays nothing');
}
// the fallback rule
{
  const days={gc:7,architect:7,engineer:10,submittal:14};
  const fromChain=steps=>{
    for(const st of steps){
      const d=/architect/i.test(st)?'architect':/engineer/i.test(st)?'engineer':'';
      if(d) return days[d];
    }
    return days.architect;
  };
  ok(fromChain(['Architect / Engineer Review'])===days.architect,
     'a combined step takes the architect period (architect is matched first)');
  ok(fromChain(['Engineer Review'])===10, 'an engineer chain takes ten days');
  ok(fromChain(['Fidevia Review','Something'])===7, 'a chain naming no discipline falls back to the architect');
  ok(fromChain([])===7, 'so does an empty chain');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-assignfirm.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
