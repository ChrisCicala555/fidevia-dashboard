// Re-read the open project without reloading the page.
//
// The dashboard reads once when a project is opened and then shows what it
// read, so anything filed since is missing until a page reload — and a page
// reload means going back through Auth0 for some people.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/id="btn-refresh"/.test(html), 'there is a refresh button');
{
  const foot = html.split('<div class="sidebar-footer">')[1].split('</div>')[0];
  ok(foot.indexOf('btn-refresh') < foot.indexOf('Switch Project'),
     'above Switch Project, where it was asked for');
  ok(/Re-read this project from Box/.test(foot), 'saying what it does');
}

const setup = () => {
  const b = bootPage('index.html'); b.run(SEED);
  b.run(`
    globalThis.__ops=[]; globalThis.__rendered=0;
    proxyCall = async (op)=>{ __ops.push(op);
      if(op==='readModules') return {modules:{}};
      if(op==='list') return {entries:[{id:'c',name:'Project Info.json',type:'file'}]};
      if(op==='docsList') return {entries:[],atRoot:true};
      if(op==='accountEmails') return {emails:[],profiles:{}};
      return {}; };
    boxGetText = async ()=> JSON.stringify({owner:'read again', contractors:[]});
    renderAll = ()=>{ __rendered++; };
    SCHED_UPLOADS=[{company:'x'}]; SCHED_LAST_SEND={at:'x'}; MY_SCHEDULE={state:'stale'}; NOTIF_LOG=[1];
  `);
  return b;
};

{
  const b = setup();
  await b.ctx.refreshProject();
  const ops = JSON.parse(b.run('JSON.stringify(__ops)'));
  ok(ops.includes('readModules'), 'it re-reads the records');
  ok(b.run("currentProject.config.owner")==='read again',
     'and the project configuration, which can change too — a contractor added, a workflow edited');
  ok(b.run('__rendered')>0, 'then redraws');
  // Panels that cache their own answers have to be told to ask again, or a
  // refresh would redraw yesterday's answer.
  ok(b.run('SCHED_UPLOADS')===null && b.run('MY_SCHEDULE')===null && b.run('NOTIF_LOG')===null,
     'the panels holding their own answers are cleared');
  ok(b.run("document.getElementById('btn-refresh').disabled")===false, 'the button comes back');
  ok(/Up to date/.test(b.run("document.getElementById('btn-refresh').innerHTML")), 'and says it finished');
}
{
  // Pressing it twice must not run two refreshes over each other.
  const b = setup();
  b.run('REFRESHING=true; __ops=[];');
  await b.ctx.refreshProject();
  ok(JSON.parse(b.run('JSON.stringify(__ops)')).length===0,
     'a second press while one is running does nothing');
}
{
  // A failure has to say so rather than sitting on "Refreshing…" forever.
  const b = setup();
  b.run("proxyCall = async ()=>{ throw new Error('Box is down'); };");
  await b.ctx.refreshProject();
  ok(/Could not refresh/.test(b.run("document.getElementById('btn-refresh').innerHTML")),
     'a failure says so');
  ok(b.run('REFRESHING')===false, 'and does not leave it wedged');
  ok(b.run("document.getElementById('btn-refresh').disabled")===false, 'nor the button disabled');
}
{
  // With no project open there is nothing to re-read.
  const b = setup();
  b.run('currentProject=null; __ops=[];');
  await b.ctx.refreshProject();
  ok(JSON.parse(b.run('JSON.stringify(__ops)')).length===0, 'with no project open it asks for nothing');
}

console.log((bad?'FAIL':'ok  '),' tools-test-refresh.mjs —',n,'assertions');
process.exit(bad?1:0);
