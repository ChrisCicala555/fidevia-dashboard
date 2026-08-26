// The workflow email goes to everyone on the notify list, by design — the whole
// team follows the item. That makes the subject line the only thing telling a
// reader whether it concerns them, so it has to name who it is waiting on.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.wf.tmp.mjs', [
  "export let allData={contacts:[",
  "  {Name:'Sarah Draper',Company:'Draper & Associates'},",
  "  {Name:'Aisha Rahman',Company:'Keystone Engineering'},",
  "  {Name:'Tom Reed',Company:'Draper & Associates'}]};",
  grab('function firmOf'), grab('function wfGroupAt'),
  "export { firmOf, wfGroupAt };"
].join('\n'));
const { firmOf, wfGroupAt } = await import('./.wf.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

// Mirror the production expressions exactly.
const firmsFor=(steps,next)=>{
  if(next>=steps.length) return '';
  const [a,b]=wfGroupAt(steps,next);
  const grp=steps.slice(a,b+1);
  return [...new Set(grp.map(st=>firmOf(st.person||st.name||'') || (st.person||st.name||'')).filter(Boolean))].join(', ');
};
const namesFor=(steps,next)=>{
  if(next>=steps.length) return 'Complete';
  const [a,b]=wfGroupAt(steps,next);
  return steps.slice(a,b+1).map(st=>{ const who=st.person||st.name||''; const f=firmOf(who); return f?who+' ('+f+')':who; }).join(', ');
};

const chain=[{name:'GC Review',person:'Tom Reed'},{name:'Architect Review',person:'Sarah Draper'},{name:'Engineer Review',person:'Aisha Rahman'}];

console.log('Subject names the firm');
ok('single reviewer resolves to their firm', firmsFor(chain,1)==='Draper & Associates');
ok('a different step gives a different firm', firmsFor(chain,2)==='Keystone Engineering');
ok('past the end gives nothing',             firmsFor(chain,3)==='');

console.log('Parallel steps');
const par=[{name:'GC',person:'Tom Reed'},{name:'Arch',person:'Sarah Draper',parallel:true},{name:'Eng',person:'Aisha Rahman',parallel:true}];
const both=firmsFor(par,1);
ok('names every firm in a parallel group', both.includes('Draper & Associates') && both.includes('Keystone Engineering'));
// Two people from one firm reviewing together should not say it twice.
const same=[{name:'A',person:'Sarah Draper'},{name:'B',person:'Tom Reed',parallel:true}];
ok('a firm is not repeated', firmsFor(same,0)==='Draper & Associates');

console.log('Unknown people');
ok('an unlisted person falls back to their name',
   firmsFor([{name:'X',person:'Nobody Known'}],0)==='Nobody Known');
// An unassigned step falls back to the step's own name, which reads correctly:
// "Awaiting Architect Review" beats "Awaiting review".
ok('an unassigned step falls back to the step name',
   firmsFor([{name:'Architect Review',person:''}],0)==='Architect Review');
ok('a step with neither yields nothing',
   firmsFor([{name:'',person:''}],0)==='');

console.log('Body still names the person');
ok('body pairs person and firm', namesFor(chain,1)==='Sarah Draper (Draper & Associates)');
ok('body handles an unknown firm', namesFor([{name:'X',person:'Nobody Known'}],0)==='Nobody Known');
ok('body says Complete past the end', namesFor(chain,3)==='Complete');

console.log('Wiring');
// Only the explanatory comment may mention the old wording, never a subject.
ok('the misleading subject is gone',
   !/'\[Fidevia\][^']*Ready for your review/.test(src));
ok('the subject says who it awaits',  /— Awaiting '\+\(nextFirms/.test(src));
ok('completion still reads plainly',  /— Workflow complete/.test(src));
ok('everyone on the notify list is still included', /notifyContacts\(notifyField, subj/.test(src));
ok('the next reviewer is still added on top', /extraTo:extra/.test(src));
ok('the body row is labelled Next in Workflow', /\['Next in Workflow',nextNames\]/.test(src));

fs.rmSync('.wf.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
