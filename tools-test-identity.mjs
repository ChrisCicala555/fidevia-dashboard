// A person's email is their identity: it keys their Auth0 account and their
// project grants. Their name is just a label. These tests hold that line.
import { execSync } from 'child_process';
import fs from 'fs';
execSync('node tools-extract-filters.mjs', { cwd: process.cwd() });
const { splitName } = await import('./.filters.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };
const eq=(n,a,b)=>ok(n+'  (got '+JSON.stringify(a)+')', JSON.stringify(a)===JSON.stringify(b));

console.log('Name splitting');
eq('ordinary two-part name', splitName('Chris Celmer'), {first_name:'Chris', last_name:'Celmer'});
eq('multi-word family name', splitName('Mary Jo Van Der Berg'), {first_name:'Mary', last_name:'Jo Van Der Berg'});
eq('single name', splitName('Cher'), {first_name:'Cher', last_name:''});
eq('surrounding whitespace ignored', splitName('  Aisha   Rahman  '), {first_name:'Aisha', last_name:'Rahman'});
eq('empty stays empty', splitName(''), {first_name:'', last_name:''});
eq('null is safe', splitName(null), {first_name:'', last_name:''});
eq('undefined is safe', splitName(undefined), {first_name:'', last_name:''});
eq('hyphenated surname is one word', splitName('Ana Lopez-Reyes'), {first_name:'Ana', last_name:'Lopez-Reyes'});

// The directory joins first + last with a space to display. Editing a name and
// saving it must produce the same string back, or names would drift on save.
console.log('Round trip');
const display = p => ((p.first_name||'')+' '+(p.last_name||'')).trim();
for (const n of ['Chris Celmer','Mary Jo Van Der Berg','Cher','Ana Lopez-Reyes','Jean-Luc Picard']) {
  ok('round trips unchanged: '+n, display(splitName(n)) === n);
}
// And a second save of an already-saved name must not shift it again.
for (const n of ['Mary Jo Van Der Berg','Chris Celmer']) {
  ok('stable on re-save: '+n, display(splitName(display(splitName(n)))) === n);
}

console.log('Email is not an editable field');
const src = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const meta = src.slice(src.indexOf("op === 'setContactMeta'"), src.indexOf("op === 'accountEmails'"));
ok('setContactMeta never assigns pr.email', !/pr\.email\s*=/.test(meta));
ok('setContactMeta rejects an email in the body', /body\.email !== undefined\) return json/.test(meta));
ok('setContactMeta still accepts a name', /body\.name !== undefined/.test(meta));
ok('setContactMeta still accepts company, role and phone',
   /body\.company !== undefined/.test(meta) && /body\.role !== undefined/.test(meta) && /body\.phone !== undefined/.test(meta));

const html = fs.readFileSync('index.html','utf8');
ok('the directory renders email as locked, not as an input', html.includes('class="cd-locked"'));
ok('the directory no longer offers an email input', !/fld\(idx,'email'/.test(html));
ok('the directory offers a name input', /fld\(idx,'name'/.test(html));

fs.rmSync('.filters.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
