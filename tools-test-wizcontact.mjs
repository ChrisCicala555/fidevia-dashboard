// Wizard contact rows recognise someone already in the directory.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/<datalist id="dir-names"><\/datalist>/.test(html), 'the name list exists');
ok(/<datalist id="dir-emails"><\/datalist>/.test(html), 'the email list exists');
ok(/list="dir-names" class="ct-name"/.test(html), 'the name field offers directory names');
ok(/list="dir-emails" type="email" class="ct-email"/.test(html), 'the email field offers directory emails');
ok(/wizContactLookup\(this,\\'name\\'\)/.test(html), 'typing a name triggers the lookup');
ok(/wizContactLookup\(this,\\'email\\'\)/.test(html), 'typing an email triggers it too');
ok(/function wizContactLookup/.test(html), 'the lookup exists');

const fn = html.split('function wizContactLookup')[1].split('function wizAddContractor')[0];
ok(/if\(v\.length<2\) return;/.test(fn), 'it does not fire on a single character');
ok(/!f\.value\.trim\(\)/.test(fn), 'only blank fields are written');
ok(/all\.length===1 \? all\[0\] : null/.test(fn), 'an ambiguous name fills nothing rather than guessing');
ok(/if\(field!=='name'\)  put\('\.ct-name'/.test(fn), 'looking up by email fills the name');
ok(/if\(field!=='email'\) put\('\.ct-email'/.test(fn), 'looking up by name fills the email');
ok(/ct-from/.test(fn) && /Filled in from the contact directory/.test(fn),
   'the row says where the values came from');
ok(/Anything you had already typed was kept/.test(fn), 'and that nothing was overwritten');
ok(/fmtPhone\(hit\.phone/.test(fn), 'the phone is formatted on the way in');

// behaviour, run for real
{
  const CD=[
    {name:'Andre Martin', email:'amartin@fidevia.com', company:'Fidevia', role:'Onsite Construction Manager', phone:'7175550101'},
    {name:'Aisha Rahman', email:'arahman@keystone-demo.test', company:'Keystone Engineering', role:'MEP Engineer', phone:''},
    {name:'Chris Celmer', email:'a@x.test', company:'Summit Builders', role:'PM', phone:''},
    {name:'Chris Celmer', email:'b@y.test', company:'Other Co', role:'Super', phone:''}
  ];
  const byEmail=v=>CD.find(c=>c.email.toLowerCase()===v.toLowerCase())||null;
  const byName=v=>{ const all=CD.filter(c=>c.name.toLowerCase()===v.toLowerCase()); return all.length===1?all[0]:null; };

  ok(byName('Andre Martin').company==='Fidevia', 'a unique name resolves');
  ok(byName('andre martin').company==='Fidevia', 'matching ignores case');
  ok(byName('Chris Celmer')===null, 'a shared name resolves to nothing (got '+JSON.stringify(byName('Chris Celmer'))+')');
  ok(byEmail('b@y.test').company==='Other Co', 'email disambiguates where the name cannot');
  ok(byName('Andre')===null, 'a partial name does not resolve — only an exact pick does');
  ok(byEmail('arahman@keystone-demo.test').role==='MEP Engineer', 'a non-Fidevia contact resolves too');

  // blank-only writes
  const put=(cur,val)=> (!String(cur||'').trim() && val) ? val : cur;
  ok(put('', 'Fidevia')==='Fidevia', 'a blank field is filled');
  ok(put('School District', 'Fidevia')==='School District', 'a typed value is kept');
  ok(put('   ', 'Fidevia')==='Fidevia', 'whitespace counts as blank');
  ok(put('', '')==='', 'a blank source leaves the field blank rather than writing empty');
}

// the list is built from the whole directory, not just Fidevia
{
  const lf = html.split('async function loadFideviaPeople')[1].split('function openNewProject')[0];
  ok(/dn\.innerHTML=CD_PICK\.map/.test(lf), 'the name list covers everyone');
  ok(/de\.innerHTML=CD_PICK\.map/.test(lf), 'the email list covers everyone');
  ok(/FIDEVIA_EMAIL\.test/.test(lf), 'the Onsite CM list is still filtered to Fidevia');
  ok(lf.indexOf('dn.innerHTML') < lf.indexOf("const dl=document.getElementById('fidevia-people')"),
     'the shared lists are built before the early return that guards the Fidevia one');
}
ok(/class="ct-name"/.test(html) && !/<select[^>]*ct-name/.test(html),
   'the name field is still free text for someone not in the directory');

console.log((bad?'FAIL ':'ok   ')+'tools-test-wizcontact.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
