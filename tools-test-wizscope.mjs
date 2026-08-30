// The wizard must never offer the last-opened project's people.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/function wfInWizard/.test(html), 'there is a way to tell wizard fields apart');
ok(/closest\('#np-workflows'\)/.test(html), 'decided by where the field lives, not by a global flag');

const pl = html.split('function wfPeopleList')[1].split('function wfCloseAC')[0];
ok(/inWizard \? fromWizard\(\)/.test(pl), 'in the wizard the team is the only source');
ok(/if\(!inWizard && !list\.length\) list=fromWizard\(\)/.test(pl),
   'outside it, the wizard is only a fallback, as before');
ok(/It used to prefer/.test(pl), 'the old behaviour is recorded so nobody restores it');

ok(/const people=wfPeopleList\(wfInWizard\(inp\)\);/.test(html), 'the suggestion list is scoped');
const co = html.split('function wfCompanyOf')[1].split('let CD_PICK')[0];
ok(/inWizard \? fromWizard\(\)/.test(co), 'the company lookup is scoped the same way');
ok(/wfCompanyOf\(inp\.value, wfInWizard\(inp\)\)/.test(html), 'and is called with the scope');

// project-context callers must keep working
{
  const calls=(html.match(/wfCompanyOf\([^)]*\)/g)||[]);
  const bare=calls.filter(c=>!/inWizard|wfInWizard/.test(c));
  ok(bare.length>=3, 'project-side callers still call it with just a name');
  ok(/const fromWizard=\(\)=>/.test(co) && /if\(!inWizard && !c\) c=fromWizard\(\)/.test(co),
     'and still fall back to the wizard when a project has no contact by that name');
}

// defence in depth
ok(/function wizClearProjectContext/.test(html), 'opening the wizard clears the old project');
{
  const cl = html.split('function wizClearProjectContext')[1].split('function openNewProject')[0];
  ok(/currentProject=null/.test(cl), 'the project itself is dropped');
  ok(/Object\.keys\(allData\|\|\{\}\)\.forEach\(k=>\{ allData\[k\]=\[\]; \}\)/.test(cl), 'its rows are dropped');
  ok(/PROJECT_ACCESS=new Set\(\); PROJECT_ROLES=\{\}/.test(cl), 'and its grants');
}
ok(/function openNewProject\(\)\{\s*wizClearProjectContext\(\);/.test(html), 'a new project clears first');
{
  const rd = html.split('async function resumeDraft')[1].split('async function discardDraft')[0];
  ok(/wizClearProjectContext\(\)/.test(rd), 'resuming a draft clears too');
  ok(rd.indexOf('wizClearProjectContext()') < rd.indexOf('wizRestoreState'),
     'and does so before the draft is written in');
}

// the behaviour itself
{
  const pick=(inWizard, projectContacts, wizardTeam)=>{
    const fromWizard=()=>wizardTeam;
    let list = inWizard ? fromWizard() : projectContacts;
    if(!inWizard && !list.length) list=fromWizard();
    return list.map(c=>c.name);
  };
  const beaverton=[{name:'Guy Gardner'}];
  const team=[{name:'Test Architect'},{name:'Penelope Odiem'},{name:'Christopher Cicala'}];
  ok(JSON.stringify(pick(true, beaverton, team))==='["Test Architect","Penelope Odiem","Christopher Cicala"]',
     'in the wizard, only the team appears (got '+JSON.stringify(pick(true,beaverton,team))+')');
  ok(!pick(true, beaverton, team).includes('Guy Gardner'),
     'the previously opened project cannot leak in — the reported bug');
  ok(JSON.stringify(pick(false, beaverton, team))==='["Guy Gardner"]',
     'inside a project, its own contacts appear');
  ok(JSON.stringify(pick(false, [], team))==='["Test Architect","Penelope Odiem","Christopher Cicala"]',
     'a project with no contacts still falls back');
  ok(pick(true, beaverton, []).length===0, 'an empty team offers nothing rather than borrowing');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-wizscope.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
