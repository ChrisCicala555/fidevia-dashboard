// "Can we align these actions to a grid? So Generate CO/PCO are all below each
// other, and Archive all symmetrically below each other? I don't like how when
// one option is unavailable, it scoots them all over."
//
// The actions were written inline, so a row that could not offer one simply had
// one fewer button and everything after it slid left. Reading down the column
// there was no line to follow: Delete sat under Archive under Generate,
// depending on what each row happened to allow.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`IS_ADMIN=true; EXTERNAL=false;`);

const CO=(o)=>Object.assign({'PCO #':'PCO-GC-001','CO #':'','Company':'Summit Builders','Status':'Open'},o);
const cells=(r,i)=>P.run(`rowActions('co',${i},${JSON.stringify(r)},{gen:coGenBtn(${i},${JSON.stringify(r)})})`);
const cols=h=>(String(h).match(/grid-template-columns:([^;]+);/)||[])[1];
const slots=h=>[...String(h).matchAll(/<span class="ra-slot">([\s\S]*?)<\/span>/g)].map(m=>m[1]);
const label=x=>((String(x).match(/>([^<>]*)<\/button>/)||[])[1]||'').trim();

console.log('Every row declares the same columns');
{
  const openPco=cells(CO(),0);
  const doneCo =cells(CO({'CO #':'CO-GC-001','Status':'Approved'}),1);
  ok(cols(openPco)==='78px 112px 70px', 'a proposal declares three slots — got '+cols(openPco));
  ok(cols(doneCo)===cols(openPco), 'and an executed change order declares exactly the same');
  ok(slots(openPco).length===3 && slots(doneCo).length===3, 'three slots on both rows');
}

console.log('An action it cannot offer leaves its slot empty');
{
  const openPco=cells(CO(),0);
  const s=slots(openPco);
  ok(s[0].trim()==='', 'a proposal cannot be archived, so the leftmost slot is empty rather than absent');
  ok(label(s[1])==='Generate PCO', 'the generate slot holds the generate button');
  ok(label(s[2])==='Delete', 'and Delete stays on the right instead of sliding left');
}
{
  const doneCo=cells(CO({'CO #':'CO-GC-001','Status':'Approved'}),1);
  const s=slots(doneCo);
  ok(/Archive/.test(s[0]), 'a settled one fills the leftmost slot with Archive, where Christopher wants it');
  ok(label(s[1]).indexOf('Generate')===0, 'Generate in the second');
  ok(label(s[2])==='Delete', 'Delete in the third — the same column on both rows');
}
{
  // The two rows in the screenshot, side by side: same slot, same position.
  const a=slots(cells(CO(),0)), b=slots(cells(CO({'CO #':'CO-GC-001','Status':'Approved'}),1));
  ok(a.length===b.length, 'the rows have the same number of slots');
  ok(label(a[2])===label(b[2]), 'so Delete is under Delete, which is the whole complaint');
}

{
  // A change order decided against offers no Generate at all. Its slot still has
  // to be declared, or that row would have two columns while its neighbours
  // have three — which is the original complaint in a different guise.
  const stopped=CO({'CO #':'CO-GC-009','Status':'Rejected','Workflow Status':'Rejected'});
  ok(P.run(`coGenBtn(2,${JSON.stringify(stopped)})`)==='', 'the fixture really does offer no Generate');
  const cell=cells(stopped,2);
  ok(cols(cell)==='78px 112px 70px', 'it still declares three columns — got '+cols(cell));
  ok(slots(cell).length===3, 'and renders three slots');
  ok(slots(cell)[1].trim()==='', 'the generate slot of which is empty');
  ok(label(slots(cell)[2])==='Delete', 'leaving Delete under Delete');
}

console.log('Other logs line up too, with their own slot count');
{
  const closed=P.run(`rowActions('rfi',0,{'RFI #':'R1','Status':'Closed'})`);
  const open  =P.run(`rowActions('rfi',1,{'RFI #':'R2','Status':'Open'})`);
  ok(cols(closed)==='78px 70px', 'an RFI declares two slots, since it has no generate action');
  ok(cols(open)===cols(closed), 'and every RFI row declares the same two');
  ok(slots(open)[0].trim()==='' && label(slots(open)[1])==='Delete',
     'an open RFI leaves the archive slot empty and keeps Delete where it was');
  ok(/Archive/.test(slots(closed)[0]), 'and Archive is the leftmost action throughout');
  ok(/Archive/.test(slots(closed)[0]), 'a closed one fills it');
}
{
  const sub=P.run(`rowActions('sub',0,{'Submittal #':'S1','Status':'Approved'})`);
  ok(cols(sub)==='78px 70px', 'submittals match RFIs');
}

console.log('Nothing to offer draws nothing');
{
  P.run(`IS_ADMIN=false;`);
  ok(P.run(`rowActions('rfi',0,{'RFI #':'R1','Status':'Closed'})`)==='',
     'a reader with no actions gets no empty grid holding blank slots open');
  P.run(`IS_ADMIN=true;`);
}

console.log('Archive first, Delete last');
{
  const s=slots(cells(CO({'CO #':'CO-GC-001','Status':'Approved'}),1));
  ok(/Archive/.test(s[0]), 'Archive is the first slot');
  ok(label(s[s.length-1])==='Delete', 'and Delete the last, furthest from the one pressed most often');
}
ok(/th\.admin-col\{text-align:center;\}/.test(html),
   'the Actions heading is centred over the buttons rather than over the right edge of the column');

console.log('The CSS that makes the slots line up');
{
  const css=html.slice(html.indexOf('.row-acts{'), html.indexOf('.row-acts .row-act{')+120);
  ok(/display:grid/.test(css), 'the cell is a grid');
  ok(/justify-content:center/.test(css), 'centred in the column, under a centred heading');
  ok(/\.row-acts \.row-act\{margin:0/.test(css),
     'and the inline margin between buttons is dropped, since the gap now spaces them');
}
ok(/RA_SLOT=\{gen:'112px', archive:'78px', del:'70px'\}/.test(html),
   'the widths are fixed, not auto — each cell is its own grid, and auto columns would size to that row alone');
{
  // The old inline concatenations are gone, or one log would still slide.
  ok(!/archiveBtn\('rfi',i,r\)\+delBtn\('rfi',i\)/.test(html), 'the RFI log no longer concatenates them');
  ok(!/archiveBtn\('sub',i,r\)\+delBtn\('sub',i\)/.test(html), 'nor submittals');
  ok(!/coGenBtn\(i,r\)\+archiveBtn\('co',i,r\)/.test(html), 'nor change orders');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-rowgrid.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
