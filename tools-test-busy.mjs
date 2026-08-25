// Row actions talk to Box and take a second or two. withBusy is what tells the
// person something is happening, and — just as important — puts itself back if
// the work fails, so a network error does not leave a dead button.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

let confirmAnswer=true, confirmCalls=[];
fs.writeFileSync('.busy.tmp.mjs', [
  "const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');",
  "export let calls=[];",
  "export function setConfirm(v){ globalThis.__ans=v; }",
  "globalThis.confirm=(m)=>{ calls.push(m); return globalThis.__ans; };",
  grab('async function withBusy'),
  "export { withBusy };"
].join('\n'));
const mod = await import('./.busy.tmp.mjs');
const { withBusy, calls, setConfirm } = mod;

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

// A stand-in for the button and its row.
const makeBtn = () => {
  const row = { classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, has(c){return this._s.has(c)} }, isConnected:true };
  return { disabled:false, innerHTML:'Archive', isConnected:true, closest:()=>row, _row:row };
};

console.log('Happy path');
setConfirm(true);
let btn=makeBtn();
let seen={};
await withBusy({currentTarget:btn}, 'Archiving…', async()=>{
  seen.disabled=btn.disabled; seen.html=btn.innerHTML; seen.rowBusy=btn._row.classList.has('row-busy');
});
ok('button is disabled while working',      seen.disabled===true);
ok('label changes to the verb',             /Archiving/.test(seen.html));
ok('a spinner is shown',                    /class="spin"/.test(seen.html));
ok('the row is marked busy',                seen.rowBusy===true);
ok('button is re-enabled afterwards',       btn.disabled===false);
ok('original label is restored',            btn.innerHTML==='Archive');
ok('row busy marker is cleared',            btn._row.classList.has('row-busy')===false);

console.log('Failure path');
btn=makeBtn();
let threw=false;
try{ await withBusy({currentTarget:btn}, 'Deleting…', async()=>{ throw new Error('Box said no'); }); }
catch(e){ threw=true; }
ok('the error still propagates',            threw===true);
ok('button recovers after a failure',       btn.disabled===false);
ok('label recovers after a failure',        btn.innerHTML==='Archive');
ok('row busy marker clears after failure',  btn._row.classList.has('row-busy')===false);

console.log('Confirmation');
calls.length=0; setConfirm(false);
btn=makeBtn(); let ran=false;
await withBusy({currentTarget:btn}, 'Deleting…', async()=>{ ran=true; }, 'Really delete?');
ok('declining stops the work',              ran===false);
ok('declining leaves the button untouched', btn.disabled===false && btn.innerHTML==='Archive');
ok('declining never marks the row busy',    btn._row.classList.has('row-busy')===false);
ok('the question was actually asked',       calls.length===1 && calls[0]==='Really delete?');

calls.length=0; setConfirm(true);
btn=makeBtn(); ran=false;
await withBusy({currentTarget:btn}, 'Deleting…', async()=>{ ran=true; }, 'Really delete?');
ok('accepting runs the work',               ran===true);

// The spinner must never appear behind a modal dialog.
console.log('Ordering');
calls.length=0; setConfirm(true);
btn=makeBtn(); let htmlAtConfirm=null;
globalThis.confirm=(m)=>{ htmlAtConfirm=btn.innerHTML; calls.push(m); return true; };
await withBusy({currentTarget:btn}, 'Deleting…', async()=>{}, 'Sure?');
ok('the dialog is asked before the spinner starts', htmlAtConfirm==='Archive');

console.log('Wiring');
ok('Archive is wrapped',        /withBusy\(event,\\?'Archiving/.test(src));
ok('Delete is wrapped',         /withBusy\(ev,'Deleting/.test(src));
ok('Delete asks for an optional reason', /askDelete\(ev, key, i\)/.test(src) && /Reason \(optional\)/.test(src));
ok('cancelling the prompt cancels the delete', /if\(why===null\) return;/.test(src));
ok('the reason reaches the audit log', /auditLog\('Deleted', key, removed, why\)/.test(src));
ok('the reason is omitted from the email when blank', /if\(why\) rows\.push\(\['Reason'/.test(src));
ok('Restore is wrapped',        /withBusy\(event,\\?'Restoring/.test(src));
ok('Approve Step is wrapped',   /withBusy\(event,\\?'Approving/.test(src));
ok('Archive asks first',        /Archive this item\?/.test(src));
ok('Delete still warns it is permanent', /Delete this item permanently\?/.test(src));
ok('no duplicate confirm left in deleteRow',
   !/async function deleteRow[\s\S]{0,120}confirm\(/.test(src));
ok('no duplicate confirm left in setArchived',
   !/async function setArchived[\s\S]{0,200}confirm\(/.test(src));
ok('a blank status renders a dash, not an empty pill',
   /if\(!String\(status\|\|''\)\.trim\(\)\) return/.test(src));

fs.rmSync('.busy.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
