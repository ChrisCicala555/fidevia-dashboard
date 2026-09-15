// "It shouldn't let a contractor upload a submittal, RFI, CO or payment
// application without attaching a file."
//
// Each of those is a request about a document. Filed from outside with nothing
// attached, the row is a title and a date: the reviewer it reaches has nothing
// to review, and asking for the drawing afterwards costs a day.
//
// Fidevia is not held to it — Fidevia records things that arrived by other
// means, and refusing the record because the paperwork has not caught up would
// lose the fact that it happened.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);

console.log('Which forms are covered');
{
  const keys=P.run(`Object.keys(FILE_REQUIRED_EXTERNAL)`);
  ['rfi','submittal','co','payapp','payapp_ext'].forEach(k=>
    ok(keys.indexOf(k)>=0, k+' requires a document from outside'));
  ok(keys.indexOf('cdaily')<0 && keys.indexOf('cdaily_ext')<0,
     'daily reports are not on the list — they already require their own file separately');
  ok(keys.indexOf('contact')<0, 'and a contact is not a document at all');
}
{
  const msgs=P.run(`Object.keys(FILE_REQUIRED_EXTERNAL).map(k=>FILE_REQUIRED_EXTERNAL[k])`);
  ok(msgs.every(m=>m && m.length>20), 'each says what to attach rather than "file required"');
  ok(/drawing, sketch or photograph/.test(P.run(`FILE_REQUIRED_EXTERNAL.rfi`)),
     'an RFI asks for the thing the question is about');
  ok(/quote, sketch or breakdown/.test(P.run(`FILE_REQUIRED_EXTERNAL.co`)),
     'a change order asks for the backup the price is built on');
}

console.log('The rule, and who it binds');
{
  const g=html.slice(html.indexOf('// ── A DOCUMENT IS THE POINT OF THE RECORD ──'), html.indexOf('let newRow={};'));
  ok(/if\(viewingAsExternal\(\) && FILE_REQUIRED_EXTERNAL\[currentModal\] && !attachId\)/.test(g),
     'required of whoever is filing from outside');
  ok(/throw new Error\(FILE_REQUIRED_EXTERNAL\[currentModal\]\)/.test(g),
     'and refused with the message for that form');
  ok(!/IS_ADMIN/.test(g), 'decided by where the reader is, not by an admin flag');
}
{
  // Before the row is built, or a refusal would leave a half-written record.
  ok(html.indexOf('FILE_REQUIRED_EXTERNAL[currentModal] && !attachId')
     < html.indexOf("if(currentModal==='rfi'){"),
     'checked before any row is assembled');
}
{
  // It sits after the upload, so attachId reflects a file that actually landed.
  const up=html.indexOf('_NOTIF_OPTS.attachments');
  ok(up>0 && up < html.indexOf('FILE_REQUIRED_EXTERNAL[currentModal] && !attachId'),
     'and after the upload, so it is judging a file that reached Box rather than one merely chosen');
}

console.log('The asterisk follows the reader');
{
  const o=html.slice(html.indexOf('// The asterisk belongs to the reader'), html.indexOf("if(type==='payapp_ext'){"));
  ok(/viewingAsExternal\(\) && !!FILE_REQUIRED_EXTERNAL\[type\]/.test(o),
     'the field is marked required for the same people the rule binds');
  ok(/star\.innerHTML = req \? /.test(o) && /: ''/.test(o),
     'and unmarked for Fidevia, where it is genuinely optional');
  ok(/\{rfi:'rfi',co:'co',submittal:'sub'\}/.test(o),
     'mapping each form to its own marker, since the ids differ from the form names');
}
{
  for(const [form,id] of [['rfi','f-file-req-rfi'],['co','f-file-req-co'],['submittal','f-file-req-sub']]){
    ok(html.indexOf('id="'+id+'"')>=0, form+' has somewhere to put the mark');
  }
  // The pay app form says it in the label already.
  ok(/Payment Application File \*/.test(html), 'and the payment application already said so');
}

console.log('Fidevia is not held to it');
{
  // Recording an RFI that came in by phone, with the drawing to follow.
  P.run(`EXTERNAL=false; document.body.classList.remove('external-mode');`);
  ok(P.run(`viewingAsExternal()`)===false, 'reading as Fidevia');
  ok(P.run(`!!(viewingAsExternal() && FILE_REQUIRED_EXTERNAL['rfi'])`)===false,
     'the rule does not apply, so the record can be made and the drawing added later');
  P.run(`EXTERNAL=true;`);
  ok(P.run(`!!(viewingAsExternal() && FILE_REQUIRED_EXTERNAL['rfi'])`)===true,
     'while a contractor filing the same form must attach one');
  ok(P.run(`!!(viewingAsExternal() && FILE_REQUIRED_EXTERNAL['contact'])`)===false,
     'and a form not on the list is unaffected either way');
  P.run(`EXTERNAL=false;`);
}

console.log((bad?'FAIL':'ok  ')+' tools-test-filerequired.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
