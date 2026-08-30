// A contact row and an access grant are separate records. Deleting the row used
// to leave the grant untouched, so someone vanished from the contact sheet and
// could still sign in — a silent failure of exactly the action that looks like
// it removes them.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const proxy=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('The two records are still distinct');
ok('deleting a row does not itself touch grants',
   !/async function deleteRow[\s\S]{0,400}grantsStore/.test(src));
ok('only adminRevoke removes a grant server-side',
   /op === 'adminRevoke'/.test(proxy));

console.log('Access is now visible');
ok('project grants are loaded for admins', /async function loadProjectAccess/.test(src));
// No longer gated on being internal: externals need it for the Role column,
// and it takes a non-admin path for them.
ok('loaded when a project opens',          /\n    loadProjectAccess\(\);/.test(src));
ok('non-admins do not attempt it',         /if\(!IS_ADMIN \|\| !currentProject\) return;/.test(src));
ok('there is an Access column',            html.includes('>Access</th>'));
ok('Account and Access are separate',      html.includes('>Account</th>') && html.includes('>Access</th>'));
ok('the column explains itself',           /title="Has been granted access to this project"/.test(html));
ok('access is matched case-insensitively', /trim\(\)\.toLowerCase\(\)/.test(src.slice(src.indexOf('async function loadProjectAccess'), src.indexOf('function contactHasAccess'))));

console.log('Deleting a contact revokes their access');
const ask=src.slice(src.indexOf('function askDelete'), src.indexOf('async function deleteRow'));
ok('only asks for contacts',        /key==='contacts'/.test(ask));
ok('only asks when access exists',  /contactHasAccess\(r\)/.test(ask));
ok('warns before doing it',         /can currently open this project/.test(ask));
ok('declining stops everything',    /if\(!confirm\([\s\S]{0,180}\) return;/.test(ask));
ok('passes the decision through',   /alsoRevoke\)/.test(ask));

// withBusy sits above deleteRow in the file, so anchor on braces rather than
// on the next function name.
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };
const del=grab('async function deleteRow');
ok('revokes through the server',    /adminRevoke/.test(del));
ok('revokes before deleting the row',
   del.indexOf('adminRevoke') < del.indexOf('boxUploadText'));
ok('lowercases the email for the grant key', /toLowerCase\(\)/.test(del));
ok('updates the local set so the tick clears', /PROJECT_ACCESS\.delete/.test(del));
ok('a contact without access is unaffected',  /if\(alsoRevoke && removed/.test(del));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
