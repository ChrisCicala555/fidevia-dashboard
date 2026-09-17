// Per-folder visibility on the standard document folders, and what a stored
// template is allowed to say.
//
// Documents is the shared record of the job, so "everyone" is the default and
// the exceptions are the point. The rule is decided on the TOP-LEVEL folder
// and inherited by anything nested under it — one rule per pile of paperwork,
// rather than a permission surface that grows every time somebody adds a
// subfolder.
import { execSync } from 'child_process';
execSync('node tools-extract-filters.mjs', { cwd: process.cwd() });
const F = await import('./.filters.tmp.mjs');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const ROLES=['contractor','architect','engineer','architect-engineer','owner','custom'];
const sees=(vis)=>ROLES.filter(r=>F.visAllowsRole(vis, F.normRole(r)));

console.log('Who sees what');
ok(sees('all').length===ROLES.length, 'everyone on the project sees an open folder');
ok(sees('fidevia').length===0, 'nobody outside Fidevia sees a Fidevia-only folder');
ok(sees('design').join()==='architect,engineer,architect-engineer',
   'a design folder is the architect and the engineers — and the old combined role');
ok(sees('owner').join()==='owner', 'an owner folder is the owner');
ok(!F.visAllowsRole('design', F.normRole('contractor')), 'a contractor is not design');
ok(!F.visAllowsRole('owner', F.normRole('custom')), 'a custom role is not the owner');

console.log('An unrecognised setting is not an open door');
ok(F.normVis('')==='all', 'nothing set at all is the default, which is open');
ok(F.normVis('ALL')==='all' && F.normVis('  Fidevia ')==='fidevia', 'case and space do not matter');
ok(F.normVis('public')==='fidevia', 'a value the server does not know becomes Fidevia’s');
ok(F.normVis('everyone')==='fidevia', 'however reasonable it sounds');
ok(sees(F.normVis('anything-else')).length===0, 'so a typo hides a folder rather than exposing one');

console.log('What a stored template may say');
{
  const t=F.cleanTemplate([{name:'Testing'},{name:'ASIs',visibility:'design'}],0);
  ok(t.length===2, 'plain entries survive');
  ok(t[0].visibility==='all', 'and default to open');
  ok(t[1].visibility==='design', 'while a named visibility is kept');
}
{
  const t=F.cleanTemplate([{name:'Testing'},{name:'testing'},{name:' TESTING '}],0);
  ok(t.length===1, 'the same folder twice is one folder — Box would refuse the second anyway');
}
{
  const t=F.cleanTemplate([{name:'  '},{name:''},{name:null},{name:'Real'}],0);
  ok(t.length===1 && t[0].name==='Real', 'blank names are dropped rather than creating an unnamed folder');
}
{
  const t=F.cleanTemplate([{name:'a/b'},{name:'c\\d'}],0);
  ok(t[0].name==='a b' && t[1].name==='c d', 'a slash cannot smuggle a path into a folder name');
}
{
  const t=F.cleanTemplate([{name:'Closeout',children:[{name:'O&M Manuals'},{name:'Warranties'}]}],0);
  ok((t[0].children||[]).length===2, 'one level of nesting is kept');
  ok(t[0].children[0].name==='O&M Manuals', 'with the child names');
  ok(t[0].children[0].visibility===undefined,
     'and no visibility of their own — a child inherits, so storing one would be a rule nobody enforces');
}
{
  const deep=F.cleanTemplate([{name:'A',children:[{name:'B',children:[{name:'C'}]}]}],0);
  ok(!deep[0].children[0].children, 'nesting stops at one level');
}
{
  // The stored template is a blob. It is edited through a page that only ever
  // writes two levels, but the thing being read back is a file, and a file can
  // say anything. Without a bound on the walk this is a stack overflow inside
  // the proxy — which is every Box call on the dashboard, not just this one.
  let deep={name:'L0'}, head=deep;
  for(let i=1;i<20000;i++){ head.children=[{name:'L'+i}]; head=head.children[0]; }
  let out=null, threw='';
  try{ out=F.cleanTemplate([deep],0); }catch(e){ threw=e.message; }
  ok(!threw, 'a template nested 20,000 deep is handled rather than thrown ('+threw+')');
  ok(out && out.length===1 && !((out[0].children||[])[0]||{}).children,
     'and comes back two levels deep like any other');
}
{
  const many=F.cleanTemplate(Array.from({length:80},(_,i)=>({name:'F'+i})),0);
  ok(many.length===40, 'and the list has a ceiling');
}
ok(F.cleanTemplate(null,0).length===0 && F.cleanTemplate('nope',0).length===0,
   'a template that is not a list is no template');
ok(F.cleanFolderName('x'.repeat(200)).length===80, 'a name cannot be unbounded');

console.log('The default template');
{
  // Rebuilt the way the server does, to check the one folder that matters.
  const t=F.cleanTemplate([{name:'Testing'},{name:'Fidevia Internal',visibility:'fidevia'}],0);
  ok(F.visAllowsRole(t[1].visibility,F.normRole('architect'))===false,
     'Fidevia Internal is Fidevia’s, which is what it was before any of this');
  ok(F.visAllowsRole(t[0].visibility,F.normRole('contractor'))===true,
     'and the rest of Documents stays the shared record');
}

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
