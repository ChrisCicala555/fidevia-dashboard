// Rows that behave as buttons cannot tell a click from the end of a text
// selection drag. Selecting a company name and releasing over the row opened
// the person record — so reading the table triggered it.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

// Stand in for the browser: a selection we control and a recorded press point.
let selText='';
fs.writeFileSync('.rc.tmp.mjs', [
  "export let _pressAt=null, _pressTarget=null;",
  "export function press(x,y){ _pressAt=[x,y]; _pressTarget=null; }",
  "export function setSel(t){ globalThis.__sel=t; }",
  "globalThis.window={ getSelection:()=>({ toString:()=>globalThis.__sel||'' }) };",
  "export function pressOn(t){ _pressTarget=t; }",
  "const NOT_A_ROW_PRESS='input,textarea,select,button,a,label,[contenteditable]';",
  grab('function wasDragNotClick').replace(/^const NOT_A_ROW_PRESS.*$/m,''),
  grab('function rowActivate'),
  "export { wasDragNotClick, rowActivate };"
].join('\n'));
const M = await import('./.rc.tmp.mjs');
const { wasDragNotClick, rowActivate, press, setSel, pressOn } = M;

const NOT_A_ROW_PRESS_SEL='input,textarea,select,button,a,label,[contenteditable]';
let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('A plain click still works');
setSel(''); press(100,100);
ok('same point is a click',        wasDragNotClick({clientX:100, clientY:100})===false);
ok('a 3px wobble is still a click',wasDragNotClick({clientX:103, clientY:98})===false);
ok('4px is still a click',         wasDragNotClick({clientX:104, clientY:100})===false);

console.log('A drag is not');
ok('5px horizontally is a drag',   wasDragNotClick({clientX:105, clientY:100})===true);
ok('5px vertically is a drag',     wasDragNotClick({clientX:100, clientY:105})===true);
ok('a long sweep is a drag',       wasDragNotClick({clientX:600, clientY:100})===true);
ok('leftward travel counts too',   wasDragNotClick({clientX:20,  clientY:100})===true);

console.log('Selected text alone is enough');
// Double-click and keyboard selection do not move the pointer at all.
setSel('Summit Builders'); press(100,100);
ok('a selection blocks activation even without travel',
   wasDragNotClick({clientX:100, clientY:100})===true);
setSel('');
ok('clearing the selection restores the click',
   wasDragNotClick({clientX:100, clientY:100})===false);

console.log('rowActivate gates the callback');
let ran=0;
setSel(''); press(50,50);
rowActivate({clientX:50, clientY:50}, ()=>ran++);
ok('a click runs the handler', ran===1);
rowActivate({clientX:400, clientY:50}, ()=>ran++);
ok('a drag does not', ran===1);
setSel('some text');
rowActivate({clientX:50, clientY:50}, ()=>ran++);
ok('a selection does not', ran===1);
setSel('');
rowActivate({clientX:50, clientY:50}, ()=>ran++);
ok('the next real click still works', ran===2);
ok('the return value is passed through',
   (()=>{ setSel(''); press(1,1); return rowActivate({clientX:1,clientY:1}, ()=>'yes'); })()==='yes');
ok('a blocked call returns undefined',
   (()=>{ setSel('x'); return rowActivate({clientX:1,clientY:1}, ()=>'yes'); })()===undefined);


console.log('Where the press started');
// Safari never reports text selected inside an input, and a press that starts
// in a field and ends outside fires its click on the row — so neither the
// selection test nor stopPropagation on the field can catch this one.
const inField = { closest:(sel)=>sel===NOT_A_ROW_PRESS_SEL ? {} : null };
const inCell  = { closest:()=>null };
setSel(''); press(100,100); pressOn(inField);
ok('a press that began in a field never activates',
   wasDragNotClick({clientX:100, clientY:100})===true);
ok('even a perfectly still press in a field',
   wasDragNotClick({clientX:100, clientY:100, currentTarget:null})===true);
setSel(''); press(100,100); pressOn(inCell);
ok('a press that began on plain text still activates',
   wasDragNotClick({clientX:100, clientY:100})===false);

console.log('Wiring');
ok('the press point is captured in the capture phase', /mousedown'[\s\S]{0,100}, true\);/.test(src));
ok('the press target is captured too', /_pressTarget=e\.target/.test(src));
ok('fields are excluded by selector', /NOT_A_ROW_PRESS='input,textarea,select,button,a,label/.test(src));
ok('the View access link opens directly', /class="cd-open" onclick="event\.stopPropagation\(\);openPerson/.test(src));
// data-em now sits between the class and the handler, so the assertion allows
// attributes in between rather than pinning the exact string.
ok('the contact row is guarded',   /class="cd-row"[^>]*onclick="rowActivate\(event,\(\)=>openPerson/.test(src));
ok('every expandable row is guarded', (src.match(/rowActivate\(event,\(\)=>toggleThread/g)||[]).length===4);
ok('no bare row handlers remain',  !/onclick="toggleThread\(/.test(src) && !/onclick="openPerson\(/.test(src));
ok('buttons inside rows still stop propagation', /onclick="event\.stopPropagation\(\)"/.test(src));

fs.rmSync('.rc.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
