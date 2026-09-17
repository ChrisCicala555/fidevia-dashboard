// "Initial email should go to the architect as well."
//
// The notice when something is filed went to the first step's reviewer alone.
// On a payment application the architect is the second step, so they learned of
// an application only when it reached them — too late to have looked at the
// pencil copy with anybody.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const f=html.split('try{ if(_wfFirst.length){')[1].split('}catch(e){}')[0];

console.log('Who it goes to');
{
  ok(/const _thread = key==='pay_apps' \? payNotifyEmails\(newRow\) : \[\];/.test(f),
     'a payment application also goes to its thread');
  ok(/payNotifyEmails/.test(f),
     'through the same rule as every other payment application email, so the architect and the '
     +'engineers are on it and another contractor is not');
  ok(/: \[\];/.test(f),
     'and an RFI, a change order or a submittal is unchanged \u2014 they already tell their own lists separately');
  ok(/_wfFirst\.map\(x=>x\.email\)\.concat\(_thread\)/.test(f), 'the step owner is on it either way');
  ok(/if\(!k\|\|_seen\.has\(k\)\) return false; _seen\.add\(k\); return true;/.test(f),
     'and somebody who is both is written to once');
  ok(/String\(e\|\|''\)\.trim\(\)\.toLowerCase\(\)/.test(f), 'however their address is capitalised');
}

console.log('What it says when more than one person is reading it');
{
  ok(/const _shared=_to\.length>_wfFirst\.length;/.test(f), 'it knows when it has gone wider');
  ok(/'\[Fidevia\] '\+\(_shared\?'':'Action required: '\)/.test(f),
     'and does not demand action from people who have none');
  ok(/\(_shared\?' filed — with '\+\(_with\|\|_step\):' awaits your review'\)/.test(f),
     'the subject says it was filed and who it is with, rather than that it awaits yours');
  ok(/\(_shared\?'Filed: ':'Action Required: '\)\+_lbl/.test(f), 'the heading follows');
  ok(/_shared\?'First Step':'Your Step'/.test(f),
     'and the row cannot say "Your Step" to somebody it is not with');
  ok(/_step\+\(_shared&&_with\?\(' — '\+_with\):''\)/.test(f),
     'it names who instead, so the architect can see it is not theirs yet');
  ok(/const _with=\[\.\.\.new Set\(_wfFirst\.map\(x=>firmOf\(x\.name\)\|\|x\.name\)\.filter\(Boolean\)\)\]\.join\(', '\);/.test(f),
     'everybody in the first group, where it is a parallel one \u2014 and by their office, since a '
     +'contractor told their application is with a name they have never heard of learns less than one '
     +'told which firm has it');
}

console.log('What it still carries');
{
  ['Project','Submitted By','Due Date'].forEach(k=>
    ok(new RegExp("\\['"+k+"',").test(f), k+' is still on it'));
  ok(/\[_lbl\+' #',newRow\[_idf\]\|\|''\]/.test(f), 'and the number it is about');
  ok(/fmtDMY\(newRow\['Due Date'\]\|\|''\)\|\|'—'/.test(f),
     'with the due date read the way the rest of the dashboard reads dates');
}

console.log('And it cannot take the filing down with it');
{
  ok(/try\{ if\(_wfFirst\.length\)\{/.test(html),
     'the notice is attempted, not depended on');
  ok(/currentProject\.name\)\); \} \}catch\(e\)\{\}/.test(html),
     'a failure to work out the recipients, or to send, leaves the record filed');
  ok(/newRow\['Workflow Step'\]='0'[\s\S]{0,400}\}catch\(e\)\{\}/.test(html),
     'and so does a failure to work out the chain in the first place');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-firstnotice.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
