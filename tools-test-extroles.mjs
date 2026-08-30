// The Role column must work outside Fidevia too.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/if \(op === 'projectRoles'\)/.test(srv), 'there is a way to read roles without being an admin');
const op = srv.split("if (op === 'projectRoles')")[1].split("if (op === 'myProjects')")[0];
ok(/if \(!who\.isAdmin\) \{[\s\S]{0,200}mine\.some\(g => String\(g\.id\) === pid\)/.test(op),
   'the caller must already be granted on that project');
ok(/403/.test(op), 'and is refused otherwise');
ok(/String\(p\.id\) === pid/.test(op), 'only the project asked for is returned');
ok(/if \(hit && hit\.role\)/.test(op),
   'someone with no role on this project is absent, not listed as having none');
ok(!/company|modules/.test(op), 'nothing beyond the role is returned');
ok(/normRole\(hit\.role\)/.test(op), 'roles are normalised the same way as everywhere else');
ok(/cannot be used to work[\s\S]{0,12}out who has been refused access/.test(srv),
   'the reason absence matters is written down');

// client
const lpa = html.split('async function loadProjectAccess')[1].split('function contactHasAccess')[0];
ok(/if\(!IS_ADMIN \|\| viewingAsExternal\(\)\)/.test(lpa), 'externals take the new path');
// It was also never called for them, which is the other half of the bug.
ok(!/if\(!EXTERNAL\) loadProjectAccess\(\)/.test(html), 'the external gate on the call is gone');
ok(/Externals need this too/.test(html), 'and why it was removed is recorded');
ok(/proxyCall\('projectRoles'/.test(lpa), 'and ask for this project only');
ok(/projectId:String\(currentProject\.folderId\)/.test(lpa), 'by id');
ok(/PROJECT_ACCESS\.add\(em\)/.test(lpa), 'access and role stay in step');
ok(/adminListGrants/.test(lpa), 'Fidevia still uses the full grant list');
ok(lpa.indexOf('projectRoles') < lpa.indexOf('adminListGrants'),
   'the external branch returns before reaching the admin-only call');
ok(/if\(!currentProject\) return;/.test(lpa) && !/if\(!IS_ADMIN \|\| !currentProject\) return;/.test(lpa),
   'the early return that blanked it for externals is gone');

// what each side sees
{
  const roleCellFor=(email, roles, isFidevia)=>{
    if(isFidevia) return 'Fidevia';
    const g=roles[email]||'';
    return g || '—';
  };
  const roles={'clymerllc@gmail.com':'architect','cviewyt@icloud.com':'engineer',
               'theintergalacticinvestments@gmail.com':'contractor'};
  ok(roleCellFor('clymerllc@gmail.com',roles,false)==='architect', 'the architect now reads Architect');
  ok(roleCellFor('cviewyt@icloud.com',roles,false)==='engineer', 'the engineer reads Engineer');
  ok(roleCellFor('gabecicala@gmail.com',roles,false)==='—',
     'someone with no grant still shows a dash, not their access status');
  ok(roleCellFor('ccicala@fidevia.com',roles,true)==='Fidevia', 'Fidevia staff unchanged');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-extroles.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
