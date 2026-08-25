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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
