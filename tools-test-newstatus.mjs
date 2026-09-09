// Nobody outside Fidevia sets the status of something they are filing.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html'); b.run(SEED);
const hidden = (type) => { b.ctx.openModal(type);
  return b.run("document.getElementById('f-status-field').style.display")==='none'; };
const asExternal = role => b.run(`EXTERNAL=true; IS_ADMIN=false; currentProject.userRole='${role}';`);

asExternal('contractor');
['rfi','co','submittal'].forEach(t=>
  ok(hidden(t), 'a contractor filing a '+t+' cannot set its status'));
asExternal('architect');
['rfi','co','submittal'].forEach(t=>
  ok(hidden(t), 'nor can an architect filing a '+t+' — filing is not deciding'));

b.run("EXTERNAL=false; IS_ADMIN=true; document.body.classList.remove('external-mode');");
['rfi','co','submittal'].forEach(t=>
  ok(!hidden(t), 'Fidevia keeps the choice on a '+t+', which is sometimes a record of something already decided'));

// The preview has to show what a contractor gets, or it is not a preview.
b.run("document.body.classList.add('external-mode');");
ok(hidden('submittal'), 'and the External Viewer preview hides it too');
b.run("document.body.classList.remove('external-mode');");

// It always opens on the first option, whoever is filing.
asExternal('contractor');
b.ctx.openModal('submittal');
ok(b.run("document.getElementById('f-status').selectedIndex")===0,
   'a new item starts where the log says it starts');

// Named rather than found by walking the DOM: a wrapper reached with closest()
// is one refactor away from silently hiding nothing.
ok((html.match(/id="f-status-field"/g)||[]).length===3,
   'each of the three forms names its status field');
{
  const c = html.split('const st=document.getElementById(\'f-status\');')[1].split('const ds=')[0];
  ok(!/closest\(/.test(c), 'and it is found by that name, not by walking up from the select');
  ok(/\['rfi','co','submittal'\]\.includes\(type\)/.test(c),
     'only the three forms that carry a review status are touched');
}

console.log((bad?'FAIL':'ok  '),' tools-test-newstatus.mjs —',n,'assertions');
process.exit(bad?1:0);
