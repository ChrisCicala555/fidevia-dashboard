// A fully reviewed item is not still pending.
//
// Status and Workflow Status are separate fields, and completing the chain only
// ever set the second. So a submittal everyone had signed sat reading "Pending
// Review" beside "Workflow complete" — the two halves of one record
// contradicting each other in public.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const src = html.slice(html.indexOf('const WF_UNDECIDED'), html.indexOf('const DECIDED_AGAINST'));
const { wfStatusOnComplete } = new Function(src + '\nreturn {wfStatusOnComplete};')();
const at = (key, status) => wfStatusOnComplete(key, {Status:status});

// ── promoted, because nobody had said anything more exact ──
ok(at('sub','Pending Review')==='Approved', 'a pending submittal becomes approved');
ok(at('sub','Under Review')==='Approved', 'so does one under review');
ok(at('sub','')==='Approved', 'and one with no status at all');
ok(at('co','Open')==='Approved', 'an open change order becomes approved');
ok(at('rfi','Open')==='Closed', 'an answered RFI closes rather than being "approved"');
ok(at('pay_apps','Pending')==='Approved', 'and a pay application is approved');

// ── left alone, because a reviewer said something the chain cannot infer ──
ok(at('sub','Approved as Noted')==='', 'Approved as Noted is more specific and survives');
ok(at('sub','Revise and Resubmit')==='', 'so does Revise and Resubmit');
ok(at('sub','Rejected')==='', 'and Rejected, which completing must never overwrite');
ok(at('rfi','Answered')==='', 'an RFI already answered keeps that');
ok(at('co','Rejected')==='', 'a rejected change order stays rejected');
ok(at('sub','Something Bespoke')==='', 'and anything a project has invented is not second-guessed');

// ── wired into both places a chain can finish ──
{
  const c = html.split('function applyReviewAdvance')[1].split('function notifyContacts')[0];
  ok(/const st=wfStatusOnComplete\(key,row\); if\(st\) row\['Status'\]=st;/.test(c),
     'reviewing to the end sets it');
  ok(/row\['Workflow Status'\]='Complete'/.test(c), 'alongside the chain being marked complete');
}
{
  const c = html.split('async function wfAdvance')[1].split('function notifyFirms')[0]
        || html.split('async function wfAdvance')[1].slice(0,6000);
  ok(/const _st=wfStatusOnComplete\(key,row\); if\(_st\) row\['Status'\]=_st;/.test(c),
     'and so does approving to the end');
}
ok((html.match(/wfStatusOnComplete\(/g)||[]).length>=3,
   'both paths and the helper itself, with nowhere left setting only half the record');

// ── it never fires on a chain that has not finished ──
ok(/if\(next>=after\.length\)\{/.test(html) && /if\(next>=steps\.length\)\{/.test(html),
   'only when there is no step after this one');

console.log((bad?'FAIL':'ok  '),' tools-test-wfstatus.mjs —',n,'assertions');
process.exit(bad?1:0);
