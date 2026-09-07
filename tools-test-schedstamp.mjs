// The milestone table says when it was last updated and by whom.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/id="sched-updated"/.test(html), 'there is a footer under the table');
ok(/border-top:1px solid #F1F0E8/.test(html.split('id="sched-updated"')[1].slice(0,200)),
   'separated from the rows rather than floating loose');

const rs = html.split('function renderSchedule')[1].split('function renderMeetings')[0];
ok(/cfg\.milestonesUpdatedAt/.test(rs) && /cfg\.milestonesUpdatedBy/.test(rs), 'it reads the stamp');
ok(/Updated as of '\+fmtDMY\(when\)/.test(rs), 'and prints the date in the usual format');
ok(/— Onsite CM/.test(rs) || /Onsite CM/.test(rs), 'naming the role when it applies');
ok(/cm\.toLowerCase\(\)===who\.toLowerCase\(\)/.test(rs),
   'only when the person who saved it really is the project CM');
ok(/No update recorded yet/.test(rs), 'a project with milestones but no stamp says so');
ok(/up\.style\.display='none'/.test(rs), 'and an empty table shows nothing at all');

const ss = html.split('async function saveSchedule')[1].split('function renderMeetings')[0];
ok(/milestonesUpdatedAt=etToday\(\)/.test(ss), 'saving records the date');
ok(/milestonesUpdatedBy=\(ME_NAME\|\|ME_EMAIL\|\|''\)\.trim\(\)/.test(ss), 'and who saved it');
ok(/await resolveMe\(\)/.test(ss), 'resolving the name first');
ok(ss.indexOf('milestonesUpdatedAt') < ss.indexOf('writeProjectConfig'),
   'before the config is written, so the stamp is part of the same save');
ok(/try\{ await resolveMe\(\); \}catch\(e\)\{\}/.test(ss),
   'a failure to resolve the name does not block the save');

// what it reads like
{
  const line=(when,who,cm)=>{
    if(!when) return '';
    const role=(cm&&who&&cm.toLowerCase()===who.toLowerCase())?' — Onsite CM':'';
    return 'Updated as of '+when+(who?(' by '+who+role):'')+'.';
  };
  ok(line('07/09/2026','Andre Martin','Andre Martin')==='Updated as of 07/09/2026 by Andre Martin — Onsite CM.',
     'the CM is named as such');
  ok(line('07/09/2026','Brenda Santiago','Andre Martin')==='Updated as of 07/09/2026 by Brenda Santiago.',
     'someone else is not credited as the CM');
  ok(line('07/09/2026','','')==='Updated as of 07/09/2026.', 'an unknown editor still gives the date');
  ok(line('','Andre Martin','Andre Martin')==='', 'no date means no line');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedstamp.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
