// "Red should be swapped here because ithaca is the one doing the review."
//
// The step's name carried the colour and the party was greyed, so the line
// shouted "Architect Review" and whispered who the reader was waiting on. On a
// handed-over step the name is not even who has it: a step still called
// Architect Review sat with Ithaca Housing Project, and the emphasis pointed at
// the architect who had already passed it along.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);

const seed=(reassigned)=>P.run(`
 allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
   {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'},
   {'Name':'Owner Rep','Company':'Ithaca Housing Project','Email':'o@f.test'}];
 currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'},
                                     {name:'Engineer Review', company:'Next Level Engineers'}];
 allData.sub=[{'Submittal #':'S','Description':'d','Company':'Summit Builders','Status':'Pending Review',
   'Workflow Step':'0','Workflow Status':'In Review','Version History':'[]','Workflow Signed':'',
   'Workflow Extra':'','Workflow Done':'','Workflow Reassigned':${reassigned?`JSON.stringify({"0":{company:'Ithaca Housing Project',person:'',email:'',from:'Architect 2',by:'Test Architect',at:'2026-09-17'}})`:"''"}}]; 1;`);
const html=()=>P.run("wfProgressHTML('sub',allData.sub[0],0)");
// the markup for one step, found by the party named on it
const lineFor=(party)=>{
  const parts=html().split('<div style="display:flex');
  return (parts.find(x=>x.indexOf('>'+party+'<')>=0)||'').split('</div>')[0];
};

console.log('On the step being waited on, the party carries the emphasis');
seed(true);
{
  const live=lineFor('Ithaca Housing Project');
  ok(/color:var\(--danger\)/.test(live), 'the line is the current-step colour');
  ok(/<span style="font-weight:700;">Ithaca Housing Project<\/span>/.test(live),
     'and the firm is the bold thing on it');
  ok(/<span style="color:var\(--muted\);font-weight:500;">Architect Review<\/span>/.test(live),
     'while the step’s name is muted — it is a label, not who has it');
  ok(live.indexOf('Architect Review')<live.indexOf('Ithaca Housing Project'),
     'the name still reads first, so the line says what kind of review it is');
}

console.log('Which is the whole point on a handed-over step');
{
  const h=html();
  ok(/text-decoration:line-through;">Architect Review/.test(h), 'the original is struck through');
  ok(/handed over by Test Architect/.test(h), 'and marked as handed over');
  ok(h.indexOf('handed over')<h.indexOf('Ithaca Housing Project'),
     'above the firm that now holds it');
}

console.log('A step nobody handed over reads the same way');
seed(false);
{
  const live=lineFor('Architect 2');
  ok(/color:var\(--danger\)/.test(live), 'current step');
  ok(/<span style="font-weight:700;">Architect 2<\/span>/.test(live), 'the firm is bold');
  ok(/color:var\(--muted\);font-weight:500;">Architect Review</.test(live), 'the name is not');
  ok(!/line-through/.test(live), 'and nothing is struck through');
}

console.log('Steps not being waited on are not shouted');
{
  const later=lineFor('Next Level Engineers');
  ok(!/color:var\(--danger\)/.test(later), 'a step still to come is not in the current colour');
  ok(/<span style="font-weight:500;">Next Level Engineers<\/span>/.test(later),
     'and its firm is not bolded — only the one being waited on is');
}

console.log('The bullet still marks where the chain is');
{
  const live=lineFor('Architect 2');
  ok(/<span style="font-weight:700;">●<\/span>/.test(live), 'the current step keeps its filled bullet');
  ok(/<span style="font-weight:700;">○<\/span>/.test(lineFor('Next Level Engineers')),
     'and a later one its open one');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
