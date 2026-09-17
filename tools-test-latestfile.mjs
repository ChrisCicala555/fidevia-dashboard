// "The residual file in the file spot should be whatever is the version that
// closes out the workflow / most recent file in the review chain... this should
// not affect the file being in the version history."
//
// Which is how it already works — the row points at the newest upload and every
// earlier one stays in the history. Pinned here because nothing said so, and a
// reply that forgot to move the pointer would look exactly like a reply that
// had no file.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

console.log('The row points at the newest file');
{
  const r=html.slice(html.indexOf("let newFid=row['Attachment File ID']"), html.indexOf("let newFid=row['Attachment File ID']")+1400);
  ok(/let newFid=row\['Attachment File ID'\]\|\|'', newName=row\['Attachment Name'\]\|\|'';/.test(r),
     'a reply starts from whatever the row already points at');
  ok(/if\(fileInput\.files&&fileInput\.files\[0\]\)\{[\s\S]{0,400}newFid=/.test(r),
     'and takes the new upload when there is one');
  ok(/vs\.push\(\{v:vs\.length\+1, fileId:newFid/.test(r),
     'the version history gains an entry for it');
  ok(/row\['Attachment File ID'\]=newFid; row\['Attachment Name'\]=newName;/.test(r),
     'and the row is moved onto it — which is what the File column reads');
  ok(r.indexOf("vs.push(")<r.indexOf("row['Attachment File ID']=newFid"),
     'history first, then the pointer: the earlier file is recorded before anything moves off it');
}

console.log('A reply with no file moves nothing');
{
  // The case in front of us: an architect recording a decision and attaching
  // nothing. The row must keep pointing at what is there, not blank itself.
  const r=html.slice(html.indexOf("let newFid=row['Attachment File ID']"), html.indexOf("let newFid=row['Attachment File ID']")+1400);
  ok(!/newFid=''/.test(r), 'nothing clears the pointer');
  ok(/fileId:newFid/.test(r),
     'and the version recorded for that reply names the file still on the item, so the history reads '
     +'as a continuous record rather than gaining a blank row');
}

console.log('The firm is said once');
{
  const shows=(by,co)=>P.run(`verShowsCo(${JSON.stringify(by)}, ${JSON.stringify(co)})`);
  // The bug in the screenshot: "…@gmail.com (Summit Builders) (Summit Builders)".
  ok(shows('theintergalacticinvestments@gmail.com (Summit Builders)','Summit Builders')===false,
     'a name that already carries the firm is not given it twice');
  ok(shows('Summit Builders','Summit Builders')===false, 'nor is an exact match');
  ok(shows('summit builders','Summit Builders')===false, 'however it was cased');
  ok(shows('Dave Chen','Summit Builders')===true, 'while a plain name still gets the firm after it');
  ok(shows('','Summit Builders')===true, 'and an entry with no name shows the firm alone');
  ok(shows('Dave Chen','')===false, 'no firm, nothing to add');
  ok(shows('','')===false, 'and no name and no firm renders no empty brackets');
  ok(shows('Dave Chen','   ')===false, 'nor does a firm that is only whitespace');
  ok(shows('Dave Chen',null)===false, 'and nothing invented from nothing');
}

console.log('Green means finished and approved')
{
  const cls=(st,settled)=>{ const h=P.run(`pill(${JSON.stringify(st)}, false, ${settled?'true':'false'})`);
    const m=h.match(/class="pill ([a-z]+)"/); return m?m[1]:''; };
  // "Approved as Noted" matched nothing in the colour map and came out the same
  // neutral khaki as Open — a decision reading as no decision.
  ok(cls('Approved as Noted', true)==='approved', 'an approval with comments is an approval');
  ok(cls('Approved', true)==='approved', 'as is a plain one');
  ok(cls('Approved as Noted', false)!=='approved',
     'but not while somebody is still to sign \u2014 the same reason a change order mid-chain stops '
     +'reading green');
  ok(cls('Rejected', true)==='rejected', 'a refusal is never green, finished or not');
  ok(cls('Revise and Resubmit', true)!=='approved', 'nor is a return');
  ok(cls('Comment only \u2014 no decision', true)!=='approved', 'and a comment decides nothing');
  ok(/class="pill overdue"/.test(P.run(`pill('Approved', true, true)`)),
     'overdue still wins over everything, which is the one thing worth interrupting for');
}

console.log('What counts as nobody left to sign');
{
  const settled=(row)=>P.run(`(function(){ wfEffectiveSteps=function(){ return ${JSON.stringify(row.steps||[])}; };
    return wfSettled('sub', ${JSON.stringify(row.r||{})}); })()`);
  ok(settled({steps:[{name:'A'}], r:{'Workflow Status':'Complete'}})===true, 'a chain that ran its course');
  ok(settled({steps:[{name:'A'}], r:{'Workflow Status':'In Review'}})===false, 'not one still running');
  ok(settled({steps:[], r:{}})===true,
     'and a project with no chain configured at all \u2014 an approval is final the moment it is given, '
     +'because nothing was ever going to follow it');
}

console.log(bad ? `FAIL tools-test-latestfile.mjs — ${bad} of ${n}` : `ok   tools-test-latestfile.mjs — ${n} assertions`);
process.exit(bad?1:0);
