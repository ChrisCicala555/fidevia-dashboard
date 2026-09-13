// "If a person is trying to generate a CO from a PCO on the dashboard without
// the reviews getting complete, it should warn you that reviews need to be
// completed first."
//
// Nothing consulted the review chain. The executed change order says the
// parties have agreed the change, and the dashboard was the only thing that
// knew they had not.
//
// The PROPOSAL document is deliberately not held to this: it is what goes out
// to get the reviews in the first place.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');

const STEPS=[{person:'Dana Reyes',role:'Architect'},
             {person:'Priya Shah',role:'Engineer'},
             {person:'Christopher Cicala',role:'Construction Manager'}];
const boot=(row)=>{
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=true; EXTERNAL=false;
    currentProject.config.contractors=[{name:'Summit Builders',role:'GC',contract:'2000000',active:true}];
    currentProject.config.workflows={co:${JSON.stringify(STEPS)}};
    allData.co=[${JSON.stringify(Object.assign({'PCO #':'PCO-GC-001','CO #':'','Company':'Summit Builders',
      'Description':'Bracing','Status':'Open','Cost Impact':'5000','Approved Amount':'5000',
      'Workflow Step':'0','Workflow Status':'','Workflow Done':'[]','Workflow Signed':'{}'}, row))}];
  `);
  return P;
};

console.log('An executed change order with nobody signed off');
{
  const P=boot({'CO #':'CO-GC-001','Status':'Approved'});
  const out=P.run(`coGenNeedsReview(allData.co[0])`);
  ok(out.length===3, 'all three steps are outstanding — got '+out.length);
  ok(out.map(o=>o.person).join()==='Dana Reyes,Priya Shah,Christopher Cicala', 'named, in order');
  const h=P.run(`coUnreviewedHTML(allData.co[0])`);
  ok(/review is not finished/i.test(h), 'the warning says what is wrong');
  ok(/Dana Reyes/.test(h) && /Priya Shah/.test(h), 'and who it is waiting on');
  ok(/3 steps have/.test(h), 'counting them');
  ok(/⋯ menu/.test(h), 'pointing at the override, which records who actually approved');
  ok(/audit log will say/.test(h), 'and saying the bypass is recorded, so it is not a free pass');
}

console.log('Part way through');
{
  const P=boot({'CO #':'CO-GC-001','Status':'Approved','Workflow Step':'1',
                'Workflow Signed':JSON.stringify({'0':{by:'Dana Reyes'}})});
  const out=P.run(`coGenNeedsReview(allData.co[0])`);
  ok(out.map(o=>o.person).join()==='Priya Shah,Christopher Cicala', 'a signed step drops off the list');
  const P2=boot({'CO #':'CO-GC-001','Status':'Approved','Workflow Done':'[0,1]'});
  ok(P2.run(`coGenNeedsReview(allData.co[0])`).map(o=>o.person).join()==='Christopher Cicala',
     'and so does one recorded in Workflow Done');
}

console.log('When there is nothing to warn about');
{
  ok(boot({'CO #':'CO-GC-001','Status':'Approved','Workflow Status':'Complete'})
      .run(`coGenNeedsReview(allData.co[0])`).length===0, 'a finished chain warns about nothing');
  ok(boot({'CO #':'CO-GC-001','Status':'Approved','Workflow Status':'Rejected'})
      .run(`coGenNeedsReview(allData.co[0])`).length===0,
     'nor does one decided against — that row cannot be generated at all');
  // The proposal document is the thing you send out to GET the reviews.
  const P=boot({'Status':'Open'});
  ok(P.run(`coGenNeedsReview(allData.co[0])`).length===0,
     'generating the proposal before the review is its whole purpose, so no warning');
  ok(P.run(`coUnreviewedHTML(allData.co[0])`)==='', 'and no panel');
  // A project with no chain configured has nothing outstanding.
  const P2=boot({'CO #':'CO-GC-001','Status':'Approved'});
  P2.run(`currentProject.config.workflows={co:[]};`);
  ok(P2.run(`coGenNeedsReview(allData.co[0])`).length===0, 'no workflow configured warns about nothing');
}

console.log('The panel appears when the generator opens');
{
  const P=boot({'CO #':'CO-GC-001','Status':'Approved'});
  P.run(`PROJECT_ORGS={'summit builders':{name:'Summit Builders',line1:'1 Main',city:'Ithaca',state:'NY',zip:'14850',complete:true},
                       'ithaca housing project':{name:'Ithaca Housing Project',line1:'953 Danby',city:'Ithaca',state:'NY',zip:'14850',complete:true}};
         currentProject.config.owner='Ithaca Housing Project';`);
  P.run(`openCoGen(0)`);
  const w=P.run(`document.getElementById('cogen-unreviewed')`);
  ok(P.run(`document.getElementById('cogen-unreviewed').style.display`)!=='none', 'the warning shows');
  ok(/Dana Reyes/.test(P.run(`document.getElementById('cogen-unreviewed').innerHTML`)), 'with the names');
  ok(P.run(`document.getElementById('cogen-form').style.display`)!=='none',
     'and the form stays — this is a warning about standing, not a missing input');
  ok(P.run(`document.getElementById('cogen-go').disabled`)===false,
     'and the button stays live, because an approval given by phone is ordinary');

  // Same generator, a row whose review is done.
  P.run(`allData.co[0]['Workflow Status']='Complete'; openCoGen(0);`);
  ok(P.run(`document.getElementById('cogen-unreviewed').style.display`)==='none',
     'and the warning clears rather than sticking from the row before');
  ok(P.run(`document.getElementById('cogen-unreviewed').innerHTML`)==='', 'leaving nothing behind');
}

console.log('The press asks, and the record says so');
{
  const g=html.slice(html.indexOf('async function generateChangeOrder()'));
  const body=g.slice(0, g.indexOf('\n// ── Rolling several'));
  ok(/const _pending=coGenNeedsReview\(r\);/.test(body), 'the press checks the chain itself');
  ok(body.indexOf('_pending=coGenNeedsReview(r)') < body.indexOf("btn.disabled=true"),
     'before anything is built');
  ok(/if\(!confirm\(/.test(body) && /Issue the change order before the review is finished/.test(body),
     'and asks outright rather than relying on a panel that has been on screen a while');
  ok(/\)\) return;/.test(body), 'declining stops it');
  ok(/REVIEW UNFINISHED/.test(body), 'and going ahead is written into the audit log');
  ok(body.indexOf('REVIEW UNFINISHED') > body.indexOf("auditLog('Generated change order'"),
     'on the entry for the generation itself, where somebody looking at the document would find it');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-coreview.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
