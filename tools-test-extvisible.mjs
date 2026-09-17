// "It may exist in the code, but visually it's not there."
//
// It did exist, and it was hidden:
//
//   body.is-external-user .btn-approve { display:none !important; }
//
// Approving and rejecting were Fidevia's alone when that was written, so the
// class was hidden outright from anybody outside. Every check I ran was on the
// DOM, and the DOM was right every time. Nothing checked whether the pixels
// arrived. This does.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');

// Every class the stylesheet hides from an external reader, with the classes
// each rule spares.
function hiddenFromExternal(){
  const out=[];
  const re=/body\.is-external-user\s+\.([A-Za-z0-9_-]+)(:not\(\.([A-Za-z0-9_-]+)\))?\s*(,|\{)/g;
  let m; while((m=re.exec(html))) out.push({cls:m[1], spares:m[3]||null});
  return out;
}
// Every button the payment application log renders for somebody outside Fidevia.
function externalButtons(){
  const branch=html.split("const act=!EXTERNAL?")[1].split("return '<tr>")[0];
  const ext=branch.split(':((')[1]||'';
  const out=[];
  const re=/<button class="([^"]+)"[^>]*>([^<]*)</g;
  let m; while((m=re.exec(ext))) out.push({classes:m[1].split(/\s+/), label:m[2]});
  return out;
}

console.log('Nothing offered to an external reader is hidden from them');
{
  const hidden=hiddenFromExternal();
  ok(hidden.length>0, 'the stylesheet does hide some things from outside — sanity');
  const btns=externalButtons();
  ok(btns.length>=3, 'the log offers an external reader more than one button (got '+btns.length+')');
  btns.forEach(b=>{
    hidden.forEach(h=>{
      const carries=b.classes.includes(h.cls);
      const spared=h.spares && b.classes.includes(h.spares);
      ok(!carries || spared,
         '"'+b.label+'" carries .'+h.cls+', which is hidden from an external reader'
         +(h.spares?(' unless it also carries .'+h.spares):'')+' — it would render and never be seen');
    });
  });
  ok(btns.some(b=>/payActionLabel/.test(b.label)),
     'the review-and-sign button is one of them, whatever it is calling itself on this row');
  ok(btns.some(b=>/Submit Final/.test(b.label)), 'and so is Submit Final, which had the same fault');
  ok(btns.some(b=>/Replace file|Submit revision/.test(b.label)), 'and the replace button');
}

console.log('The rule still hides what it was written to hide');
{
  ok(/body\.is-external-user \.btn-approve:not\(\.ext-ok\)/.test(html),
     'an approve button is still hidden from outside by default');
  ok(/body\.is-external-user \.btn-reject:not\(\.ext-ok\)/.test(html), 'and a reject button');
  ok(/body\.is-external-user \.viewer-toggle,/.test(html), 'and the viewer toggle, with no way to opt out');
  ok(/body\.is-external-user \.btn-ver,/.test(html), 'and the version control');
  // The exemption has to be asked for, one button at a time.
  const count=(html.match(/btn-approve ext-ok/g)||[]).length;
  ok(count===2, 'exactly two buttons ask for the exemption: Review and Submit Final (got '+count+')');
  ok(/'<button class="'\+\(paySettled\(r\)\?'row-act':'btn-approve'\)\+'" onclick="openPayAction/.test(html),
     'and Fidevia’s own button does not ask for it, because nothing was hiding it');
}

console.log('The lesson, written down');
{
  const css=html.split('body.is-external-user .viewer-toggle,')[0].split('/*').pop();
  ok(/rendered and then hidden/.test(css) || /in the DOM, never on the screen/.test(html),
     'the rule says why an exemption exists, so the next person does not undo it');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-extvisible.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
