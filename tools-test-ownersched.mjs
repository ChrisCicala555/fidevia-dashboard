// The Owner can see the schedule.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

ok(/<div class="nav-item owner-ok" data-section="schedule">Schedule<\/div>/.test(html),
   'Schedule is in the Owner nav');
ok(/body\.role-owner \.nav-item\.owner-ok\{display:block;\}/.test(html),
   'and owner-ok is what makes a tab visible to them');

// The data has to reach them, or the tab opens empty — the Board Reports trap.
const fpc = srv.split('function filterProjectConfig')[1].split('// Apply the same row-level rules')[0];
ok(/if \(role !== ROLE_CONTRACTOR && role !== ROLE_CUSTOM\) return JSON\.stringify\(cfg\)/.test(fpc),
   'an Owner receives the project config intact, so milestones reach them');
ok(!/milestones/.test(fpc), 'nothing strips milestones for any role');

// Schedule reads config, not a CSV, so no external-read entry is needed.
const rs = html.split('function renderSchedule')[1].split("// The Owner's Home is the financial picture only")[0];
ok(/currentProject\.config\.milestones/.test(rs), 'the tab reads milestones from the config');
ok(!/allData\./.test(rs.split('scheduleStats')[0]), 'and not from a module CSV');
ok(!/Schedule\.csv|EXTERNAL_READABLE_CSV/.test(rs), 'so no server read rule is involved');

// Read-only: the Owner must not get the edit control.
ok(/<button class="btn-add admin-only" onclick="openSchedule\(\)">Edit Schedule<\/button>/.test(html),
   'Edit Schedule is admin-only');
ok(/body\.role-owner \.admin-only\{display:none !important;\}/.test(html),
   'and admin-only is hidden from the Owner');
ok(/body\.role-owner \.btn-add\{display:none !important;\}/.test(html.replace(/\s+/g,' ')) ||
   /\.role-owner \.btn-add\{display:none/.test(html.replace(/\s+/g,' ')) ||
   /role-owner \.btn-add/.test(html),
   'add buttons are hidden from the Owner as well');

// what they will actually see
ok(/card\('Days Expended', notYet \? 'N\/A'/.test(html),
   'the not-started handling applies, so a future project does not show a negative');

console.log((bad?'FAIL ':'ok   ')+'tools-test-ownersched.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
