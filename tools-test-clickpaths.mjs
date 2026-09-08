// Press the things a person presses.
//
// + New RFI was dead for thirty commits and every test passed, because the
// tests read the source and the source read fine. This one boots the page,
// seeds a project, and calls the code behind the buttons and the tabs. A stub
// is not a browser, so a pass here is not proof it looks right — but a throw
// here is a button that does nothing, which is the failure that got through.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

const b = bootPage('index.html');
ok(b.errors.length===0, 'the page boots with no load-time error'
   + (b.errors.length?' — '+b.errors[0].message:''));
b.run(SEED);
ok(typeof b.ctx.renderAll === 'function', 'the page script is reachable');

const call = (fn, args, label) => {
  if (typeof b.ctx[fn] !== 'function'){ ok(false, (label||fn)+' exists'); return; }
  let threw=null;
  try { const r=b.ctx[fn](...args); if(r&&typeof r.then==='function') r.catch(()=>{}); }
  catch(e){ threw=e; }
  ok(!threw, (label||fn+'('+args.map(a=>typeof a==='object'?'…':JSON.stringify(a)).join(',')+')')
     +' runs' + (threw?' — '+threw.message:''));
};

// ── every tab in the sidebar ──
// Read from the markup, so a tab added later is walked without anyone
// remembering to list it here.
const sections = [...new Set([...b.html.matchAll(/data-section="([a-z_]+)"/g)].map(m=>m[1]))];
ok(sections.length >= 15, 'found the nav sections ('+sections.length+')');
sections.forEach(sec => call('navTo', [sec], 'opening the '+sec+' tab'));

// ── every render, called directly ──
// navTo only draws the tab it opens; this covers the rest, including the ones
// that only run on a project load.
const renders = [...new Set([...b.html.matchAll(/^(?:async )?function (render[A-Za-z]*)\(\s*\)/gm)].map(m=>m[1]))];
ok(renders.length >= 30, 'found the render functions ('+renders.length+')');
renders.forEach(fn => call(fn, [], fn));

// ── the dialogs a row opens ──
call('openReply', ['rfi',0], 'Reply on an RFI');
call('openReply', ['sub',0], 'Reply on a submittal');
call('openReply', ['co',0],  'Reply on a change order');
call('openPayAction', [0],   'Take Action on a pay application');
call('openCoGen', [0],       'Generate Change Order');
call('openNewCo', [],        'Issue a change order');
call('openBilling', [],      'Billing and response periods');
call('openSchedule', [],     'Edit Schedule');
call('openContractors', [],  'Manage Contractors');
call('openOrg', ['Summit Builders'], 'the organization editor');
call('openDeleteModal', ['900','Ithaca'], 'Delete Project');
call('openPhotoViewer', ['2026-09-01'], 'the photo viewer');
call('openDailyGen', [],     'Generate Daily Report');
call('openNewProject', [],   'New Project Setup');
call('openFeedback', [],     'Report a Bug');

// ── the workflow panel, which is where the approvals live ──
call('wfProgressHTML', ['rfi', {'Workflow Step':'0','Workflow Status':'In Review'}, 0],
     'the workflow panel while in review');
call('wfProgressHTML', ['sub', {'Workflow Step':'1','Workflow Status':'Complete'}, 0],
     'the workflow panel once complete');
call('wfProgressHTML', ['co', {'Workflow Step':'0','Workflow Status':'Rejected'}, 0],
     'the workflow panel on a rejected item');
call('verThreadRows', ['rfi', {'Version History':'[]'}, 0, 10], 'an empty version history');
call('verThreadRows', ['rfi',
  {'RFI #':'RFI-GC-001','Version History':JSON.stringify([{v:1,status:'Open',date:'2026-09-01',by:'D',note:'n',fileId:'1',fileName:'a.pdf'}])},
  0, 10], 'a version history with a reply');
call('toggleThread', ['rfi',0], 'expanding a row');

// ── the pieces added most recently, which have had the least use ──
call('setSpecFilter', [''],     'clearing the spec filter');
call('setSpecFilter', ['04:'],  'filtering to a division');
call('setSpecFilter', ['04 20 00'], 'filtering to one section');
call('schedChaseTargets', [],   'working out who is behind on schedules');
call('schedChaseFooter', [],    'the schedule chase footer');
call('renderScheduleUploads', [], 'the monthly schedules panel');
call('loadNotifLog', [],        'the notification log');
call('contactCompanyConflicts', [], 'the signup/company disagreements');
call('reconcileContactsWithAccounts', [], 'reconciling contacts with accounts');
call('fileCell', [{'Attachment File ID':'1','Attachment Name':'a.pdf','RFI #':'RFI-GC-001'}], 'an attachment cell');
call('dlBtn', ['1','a.pdf','RFI-GC-001'], 'a download control');
call('mailLink', ['a@b.co'], 'a mail link');
call('telLink', ['5551234567'], 'a phone link');
call('emailTemplate', ['A: b', [['x','y']], 'P', 'intro'], 'an item email');

// ── the same walk as somebody outside Fidevia ──
// The external path renders different columns and hides different controls; a
// throw there is just as dead a button, and nobody at Fidevia would see it.
// Re-seed: something in the walk above legitimately clears the open project
// (the picker does), and this phase needs one open.
b.run(SEED);
b.run("EXTERNAL = true; IS_ADMIN = false; ME_EMAIL='d@s.test'; ME_COMPANY='Summit Builders';"
    + "currentProject.userCompany='Summit Builders'; currentProject.userRole='contractor';");
sections.forEach(sec => call('navTo', [sec], 'a contractor opening the '+sec+' tab'));
['renderRFIs','renderSubmittals','renderCOs','renderPayApps','renderContacts','renderOverview',
 'renderFinancials','renderSchedule','renderDocuments','renderContractorDaily','renderPayrolls']
  .forEach(fn => call(fn, [], 'a contractor seeing '+fn));
call('openModal', ['rfi'], 'a contractor opening the RFI form');
call('openModal', ['submittal'], 'a contractor opening the submittal form');
call('wfProgressHTML', ['rfi', {'Workflow Step':'0','Workflow Status':'In Review'}, 0],
     'a contractor seeing the workflow panel');

console.log((bad?'FAIL':'ok  '),' tools-test-clickpaths.mjs —',n,'assertions');
process.exit(bad?1:0);
