// Approving an access request is one of two ways someone gets onto a project.
// It was quietly the weaker of the two.
import fs from 'fs';
const src=fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
const block=src.slice(src.indexOf("op === 'approveRequest'"), src.indexOf("op === 'denyRequest'"));

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('The ReferenceError that ate the grant email');
// company/role are const-declared inside the adminGrant block. Referencing them
// here threw, and the throw landed in a try/catch that swallowed it.
ok('does not reference the out-of-scope company', !/sendGrantEmail\([^)]*\bcompany\b/.test(block));
ok('does not reference the out-of-scope role',    !/sendGrantEmail\([^)]*[^q]\brole\b/.test(block));
ok('takes company from the request record',       /reqCompany/.test(block));
ok('takes role from the request record',          /reqRole/.test(block));
ok('still sends the email',                       /sendGrantEmail\(email/.test(block));

console.log('The half-configured grant');
ok('records a company on the grant', /added\.company\s*=/.test(block));
ok('records a role on the grant',    /added\.role\s*=/.test(block));
ok('normalises the role',            /normRole\(reqRole\)/.test(block));
ok('does not overwrite an existing company', /if \(!added\.company\)/.test(block));
ok('does not overwrite an existing role',    /if \(!added\.role\)/.test(block));
ok('persists after the edit', (block.match(/gstore\.setJSON\(email, g\)/g)||[]).length >= 1);
ok('is still admin only',            /if \(!who\.isAdmin\) return json/.test(block));

// The scoping trap that caused this, asserted directly.
console.log('Scoping');
// Both names also appear in the combined guard above, so anchor on the handler.
const grantBlock = src.slice(src.indexOf("if (op === 'adminGrant') {"), src.indexOf("if (op === 'adminRevoke') {"));
ok('company is still block-scoped to adminGrant', /const company = \(body\.company/.test(grantBlock));
ok('approveRequest declares its own names',       /const reqCompany =/.test(block) && /const reqRole =/.test(block));

console.log('Sign-in screens');
const html=fs.readFileSync('index.html','utf8');
ok('profile screen uses the olive backdrop',
   /id="screen-profile"[^>]*background:var\(--olive-900\)/.test(html));
ok('sign-in screen uses the olive backdrop',
   /id="screen-auth0login"[^>]*background:var\(--olive-900\)/.test(html));
ok('it is the same value as the project loading screen',
   /id="project-loading"[^>]*background:var\(--olive-900\)/.test(html));
ok('placeholders are not the owner’s own name',
   !html.includes('placeholder="Chris"') && !html.includes('placeholder="Cicala"'));
ok('placeholders still demonstrate the format',
   html.includes('placeholder="Jordan"') && html.includes('placeholder="Reyes"'));


console.log('Requesting access');
const reqBlock = src.slice(src.indexOf("op === 'requestAccess'"), src.indexOf("op === 'listRequests'"));
ok('the request still reaches storage',        /requestsStore\(\)\.setJSON/.test(reqBlock));
ok('administrators are emailed',               /notifyAdminsOfRequest/.test(reqBlock));
ok('the notification cannot fail the request', /try \{ await notifyAdminsOfRequest[\s\S]{0,220}catch\(e\) \{\}/.test(reqBlock));
ok('the notice is sent after the record is stored',
   reqBlock.indexOf('requestsStore().setJSON') < reqBlock.indexOf('notifyAdminsOfRequest'));

const notify = src.slice(src.indexOf('async function notifyAdminsOfRequest'), src.indexOf('const reqKey ='));
ok('it gathers env admins',        /ADMIN_EMAILS/.test(notify));
ok('it gathers the project team',  /fideviaTeamFor/.test(notify));
ok('it gathers listed admins',     /getBlobAdmins/.test(notify));
ok('it always includes a fallback',/ccicala@fidevia\.com/.test(notify));
ok('recipients are deduplicated',  /new Set\(/.test(notify));
ok('it does nothing without a mail key', /SENDGRID_KEY; if\(!key\) return/.test(notify));
ok('it names the requester and project',
   /'Name'/.test(notify) && /'Company'/.test(notify) && /'Project'/.test(notify));

console.log('Request screen');
ok('the request card is centred',
   /id="screen-request"[^>]*align-items:center[^>]*justify-content:center/.test(html));
ok('the confirmation reads the way it was asked for',
   html.includes('Request submitted, thank you. Fidevia will review and respond shortly.'));
ok('the old wording is gone',
   !html.includes('A Fidevia admin will review it and grant access.'));


console.log('Fidevia project team lookup');
const team = src.slice(src.indexOf('async function fideviaTeamFor'), src.indexOf('async function notifyAdminsOfRequest'));
ok('reads the project contact sheet', /Job Contacts\.csv/.test(team));
ok('keeps only Fidevia addresses',    /endsWith\('@fidevia\.com'\)/.test(team));
ok('lowercases before matching',      /toLowerCase\(\)/.test(team));
ok('returns empty rather than throwing', /catch\(e\)\{ return \[\]; \}/.test(team));
ok('a project with no contacts folder is safe', /if\(!contF\) return \[\];/.test(team));

const src2 = fs.readFileSync('index.html','utf8');
console.log('Access request banner');
const banner = src2.slice(src2.indexOf('async function loadAccessRequests'), src2.indexOf('async function approveRequest'));
ok('prefers the profile name over the Auth0 name', /snap\.name/.test(banner));
// Auth0 sets name to the email for password accounts, which read as a duplicate.
ok('suppresses an Auth0 name that is just the email',
   /toLowerCase\(\)!==String\(r\.email\|\|''\)\.trim\(\)\.toLowerCase\(\)/.test(banner));
ok('shows the company',            /snap\.company/.test(banner));
ok('shows the role',               /snap\.role/.test(banner));
ok('shows the phone when present', /snap\.phone/.test(banner));
ok('formats the phone',            /fmtPhone\(snap\.phone\)/.test(banner));
ok('falls back to the email when no name is known', /esc\(nm\|\|r\.email\)/.test(banner));
ok('company and role are omitted when blank', /filter\(Boolean\)/.test(banner));
ok('Approve shows progress',       /withBusy\(event,\\?'Approving/.test(banner));
ok('Deny shows progress',          /withBusy\(event,\\?'Denying/.test(banner));
ok('Deny asks first',              /Deny this access request\?/.test(banner));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
