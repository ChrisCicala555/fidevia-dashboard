// A file in Documents can be opened by whoever may browse the folder.
import fs from 'fs';
const srv = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const fn = srv.split('async function callerMayReadFile')[1].split('export default async (req)')[0];
ok(/const parentId = ids\.length \? ids\[ids\.length - 1\] : ''/.test(fn),
   'the immediate parent is taken from the path');
ok(/await docsAllows\(H, t, grants, who, parentId\)\) return true/.test(fn),
   'and Documents permission is asked about it');
ok(/if you can open the folder, you can open\s*\n?\s*\/\/ what is in it/.test(fn) || /if you can open the folder/.test(fn),
   'the rule is stated');
ok(/never in the set below/.test(fn), 'and why the CSV set could not cover it');

// order matters: the Documents check must not replace the row check
ok(fn.indexOf('docsAllows') < fn.indexOf('allowedFileIds'), 'Documents is tried first');
ok(/const allowed = await allowedFileIds/.test(fn), 'the row check still runs for everything else');
ok(/return allowed\.has\(String\(fileId\)\)/.test(fn), 'and still decides those');
ok(/if \(!projectId\) return false;/.test(fn),
   'a file outside every granted project is refused before either check');
ok(fn.indexOf('if (!projectId) return false;') < fn.indexOf('docsAllows'),
   'so Documents cannot be used to reach another project');

// docsAllows is the same function the browser uses, so the two cannot disagree
{
  const da = srv.split('async function docsAllows')[1].split('const reqKey')[0];
  ok(/if \(!pos\) return false;/.test(da), 'a folder outside Documents is not its business');
  ok(/String\(pos\.party\)\.trim\(\)\.toLowerCase\(\) === mine/.test(da),
     'and a party folder belongs to one company');
}
// both readers are covered
ok((srv.match(/callerMayReadFile\(H, t, _grants, who, body\.fileId\)/g)||[]).length===2,
   'downloadUrl and fileInfo share the check');

console.log((bad?'FAIL ':'ok   ')+'tools-test-docsopen.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
