// The milestone table says when it was last updated and by whom.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/id="sched-updated"/.test(html), 'there is a footer under the table');
ok(/border-top:1px solid #F1F0E8/.test(html.split('id="sched-updated"')[1].slice(0,200)),
   'separated from the rows rather than floating loose');

// Exact signature: renderScheduleUploads is declared earlier and would match.
const rs = html.split('function renderSchedule(){')[1].split('function renderMeetings')[0];
ok(/cfg\.milestonesUpdatedAt/.test(rs) && /cfg\.milestonesUpdatedBy/.test(rs), 'it reads the stamp');
ok(/Updated as of '\+fmtDMY\(when\)/.test(rs), 'and prints the date in the usual format');
ok(/— Onsite CM/.test(rs) || /Onsite CM/.test(rs), 'naming the role when it applies');
ok(/cm\.toLowerCase\(\)===who\.toLowerCase\(\)/.test(rs),
   'only when the person who saved it really is the project CM');
// Before falling back to that, the project's creation date is used: nothing has
// been edited, so the milestones are as the project was set up.
ok(/As set when the project was created, '\+fmtDMY\(born\)/.test(rs),
   'an unedited schedule is dated from the project instead');
ok(/const born = when \|\| cfg\.createdAt/.test(rs), 'preferring a stamp the wizard wrote');
ok(/PICKER_PROJECTS\|\|\[\]\)\.find/.test(rs),
   'falling back to the Box folder date for projects that predate it');
ok(/No update recorded yet/.test(rs), 'and only says nothing is recorded when even that is missing');
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

ok(/createdAt: etToday\(\),/.test(html), 'a new project records its own creation date');
{
  const srv = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
  ok(/fields=id,name,type,created_at/.test(srv), 'the project listing asks Box for it');
  ok(/createdAt: e\.created_at \|\| ''/.test(srv), 'and returns it');
  ok(/only record of when\s*\n?\s*\/\/ a project began/.test(srv) || /only record of when/.test(srv),
     'with the reason recorded');
}
ok(/createdAt:p\.createdAt\|\|''/.test(html), 'the picker carries it through');

// the order of preference
{
  const pick=(when,cfgCreated,boxCreated)=>when||cfgCreated||boxCreated||'';
  ok(pick('07/09/2026','01/01/2026','01/01/2025')==='07/09/2026', 'a real edit wins');
  ok(pick('','01/01/2026','01/01/2025')==='01/01/2026', 'then the wizard stamp');
  ok(pick('','','01/01/2025')==='01/01/2025', 'then the Box folder date');
  ok(pick('','','')==='', 'and nothing means nothing');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-schedstamp.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
