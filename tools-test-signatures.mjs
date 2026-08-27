// A parallel group advances when any one member acts — right for a review that
// "sometimes just one or the other" does, wrong for four signatures where one
// person acting would close all four.
import fs from 'fs';
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

// Reimplement the server's group logic against the same rules, to check the
// behaviour rather than only the wiring.
const groupAt=(steps,idx)=>{ let gs=idx; while(gs>0&&steps[gs]&&steps[gs].parallel) gs--;
  let ge=gs; while(ge+1<steps.length&&steps[ge+1]&&steps[ge+1].parallel) ge++; return [gs,ge]; };
function advance(steps, row, email, isAdmin){
  const cur=parseInt(row['Workflow Step'])||0;
  const [gs,ge]=groupAt(steps,cur);
  const needsAll=steps.slice(gs,ge+1).some(st=>st&&st.requireAll);
  let done=[]; try{ done=JSON.parse(row['Workflow Done']||'[]'); }catch(e){}
  if(needsAll){
    for(let n=gs;n<=ge;n++){
      const st=steps[n]||{};
      if(isAdmin || String(st.email||'').toLowerCase()===email){ if(!done.includes(n)) done.push(n); }
    }
    row['Workflow Done']=JSON.stringify(done);
    const satisfied=steps.slice(gs,ge+1).every((_,n)=>done.includes(gs+n));
    if(!satisfied) return {partial:true, outstanding:steps.slice(gs,ge+1).map((st,n)=>done.includes(gs+n)?null:st.name).filter(Boolean)};
    row['Workflow Done']='[]';
  }
  const next=ge+1;
  if(next>=steps.length){ row['Workflow Step']=String(steps.length-1); row['Workflow Status']='Complete'; return {complete:true}; }
  row['Workflow Step']=String(next); row['Workflow Status']='In Review'; return {};
}

// Change order: review, then contractor signs, then architect and Fidevia
// together, then the owner.
const CO=[
  {name:'Fidevia Review', email:'cm@fidevia.com'},
  {name:'Design Team Review', email:'arch@d.test', parallel:true},
  {name:'Contractor Signature', email:'gc@s.test'},
  {name:'Fidevia Signature', email:'cm@fidevia.com', requireAll:true},
  {name:'Architect Signature', email:'arch@d.test', parallel:true, requireAll:true},
  {name:'Owner Signature', email:'owner@l.test'}
];

console.log('Review groups still advance on one person');
let row={'Workflow Step':'0'};
let r=advance(CO,row,'arch@d.test',false);      // design team acts, Fidevia has not
ok('either reviewer moves it on',   !r.partial && row['Workflow Step']==='2');

console.log('Signature groups wait for everyone');
row={'Workflow Step':'2'};
advance(CO,row,'gc@s.test',false);              // contractor signs
ok('the contractor signature is its own step', row['Workflow Step']==='3');
r=advance(CO,row,'cm@fidevia.com',false);       // Fidevia signs
ok('one signature does not close the group', r.partial===true);
ok('the item has not moved',                  row['Workflow Step']==='3');
ok('it names who is still outstanding',       r.outstanding.join()==='Architect Signature');
ok('the signature so far is recorded',        JSON.parse(row['Workflow Done']).includes(3));
r=advance(CO,row,'arch@d.test',false);          // architect signs
ok('the second signature closes the group',   !r.partial);
ok('and it moves to the owner',               row['Workflow Step']==='5');
ok('the record is cleared for the next group',row['Workflow Done']==='[]');
r=advance(CO,row,'owner@l.test',false);
ok('the owner completes it',                  r.complete===true && row['Workflow Status']==='Complete');

console.log('Signing twice does not double-count');
row={'Workflow Step':'3'};
advance(CO,row,'cm@fidevia.com',false);
r=advance(CO,row,'cm@fidevia.com',false);
ok('the same person signing again still waits', r.partial===true);
ok('and is recorded once',                      JSON.parse(row['Workflow Done']).filter(x=>x===3).length===1);

console.log('Someone outside the group cannot satisfy it');
row={'Workflow Step':'3'};
r=advance(CO,row,'stranger@x.test',false);
ok('an unrelated signature records nothing', r.partial===true && JSON.parse(row['Workflow Done']).length===0);

console.log('An administrator can close a group on their behalf');
row={'Workflow Step':'3'};
r=advance(CO,row,'cc@fidevia.com',true);
ok('admin completes the whole group', !r.partial && row['Workflow Step']==='5');

console.log('Server wiring');
const adv=proxy.slice(proxy.indexOf("op === 'advanceWorkflow'"), proxy.indexOf("op === 'uploadText'"));
ok('the server reads requireAll',            /st\.requireAll/.test(adv));
ok('it records progress in the log',         /row\['Workflow Done'\] = JSON\.stringify\(doneIdx\)/.test(adv));
ok('it returns who is still outstanding',    /partial: true, outstanding/.test(adv));
ok('a non-admin only signs their own steps', /direct === me\) \|\| \(viaName && viaName === me\)\) && !doneIdx\.includes\(n\)/.test(adv));
ok('the group record resets on advance',     /row\['Workflow Done'\] = JSON\.stringify\(\[\]\)/.test(adv));
ok('both paths share one writer',            (adv.match(/await writeRows\(\)/g)||[]).length===2);

console.log('Client wiring');
ok('the log carries the column',   (html.match(/'Workflow Done'/g)||[]).length>=4);
ok('the editor offers the option', /class="wf-all"/.test(src));
ok('it is saved with the step',    /requireAll:!!\(r\.querySelector\('\.wf-all'\)/.test(src));
ok('external signers see who is left', /Still waiting on: '\+\(\(res\.outstanding/.test(src));
ok('Fidevia signing on the record behaves the same', /const needsAll=steps\.slice\(gs,ge\+1\)\.some/.test(src));

console.log('Default chains match how Fidevia runs them');
const T=src.slice(src.indexOf('const WF_TEMPLATES'), src.indexOf('const WF_DEFAULTS'));
ok('RFIs go straight to design review',  /rfi:\[\s*\{name:'Architect \/ Engineer Review'/.test(T));
ok('submittals do the same',             /sub:\[\s*\{name:'Architect \/ Engineer Review'/.test(T));
ok('pay apps record amounts first',      /payapp:\[\s*\{name:'Fidevia Records Amounts'/.test(T));
ok('pay app review is either-or',        /\{name:'Architect Review', person:'', parallel:true\}/.test(T));
// The comment above the template mentions pencil copies, so check the step
// names rather than the whole block.
ok('no pencil copy step', !(T.match(/\{name:'[^']*'/g)||[]).some(n=>/pencil/i.test(n)));
ok('change orders review before signing',/co:\[\s*\{name:'Fidevia Review'/.test(T));
ok('the contractor signs first',         T.indexOf('Contractor Signature') < T.indexOf('Fidevia Signature'));
ok('architect and Fidevia sign together',/\{name:'Architect Signature', person:'', parallel:true, requireAll:true\}/.test(T));
ok('the owner signs last',               T.indexOf('Owner Signature') > T.indexOf('Architect Signature'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
