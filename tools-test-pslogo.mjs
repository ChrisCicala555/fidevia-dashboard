// Logo, board reports and project admin, editable after creation.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// the three that had no way back
ok(/id="ps-logo-preview"/.test(html), 'the logo has a preview in Settings');
ok(/id="ps-logo"[^>]*onchange="psLogoPick\(this\)"/.test(html), 'a new one can be chosen');
ok(/id="ps-logo-remove"/.test(html), 'and an existing one removed');
ok(/id="ps-board"/.test(html), 'the Board Reports tab can be turned on later');
ok(/id="ps-admin"/.test(html), 'the project administrator is editable');

// loaded and saved
ok(/set\('ps-admin',c\.projectAdmin\)/.test(html), 'the admin is loaded');
ok(/bd\.checked=!!c\.boardReportsEnabled/.test(html), 'the board flag is loaded');
ok(/psLogoShow\(\)/.test(html.split('function fillProjectSettings')[1].slice(0,900)),
   'the logo is shown when the pane opens');
ok(/c\.projectAdmin=v\('ps-admin'\)/.test(html), 'the admin is saved');
ok(/c\.boardReportsEnabled=!!_bd\.checked/.test(html), 'the board flag is saved');

const show = html.split('async function psLogoShow')[1].split('function psLogoPick')[0];
ok(/box\.textContent='No logo'/.test(show), 'no logo says so, rather than showing an empty box');
ok(/Logo missing/.test(show), 'a recorded logo that will not load is distinguished from having none');
ok(/A logo is recorded but the file could not be loaded/.test(show),
   'and explains it, since the two look identical but need different fixes');
ok(/PICKER_LOGOS\[id\]/.test(show), 'it reuses the picker cache rather than refetching');
ok(/Not saved yet/.test(show), 'a chosen file is marked unsaved');

const pick = html.split('function psLogoPick')[1].split('function psLogoRemove')[0];
ok(/URL\.createObjectURL/.test(pick), 'the chosen file is previewed before upload');
ok(/revokeObjectURL/.test(pick), 'and the previous preview is released');

const rm = html.split('function psLogoRemove')[1].split('async function saveContactField')[0];
ok(/if\(PS_LOGO_PENDING\)\{/.test(rm), 'removing an unsaved choice just cancels it');
ok(/The image stays in Box/.test(rm), 'removing a saved one says what it does and does not delete');
ok(/PS_LOGO_PENDING=\{remove:true/.test(rm), 'removal is staged rather than applied immediately');

// save ordering
{
  const sv = html.split('async function saveProjectSettings')[1].split('function relocateDatesPanel|async function psLogoShow')[0];
  ok(/if\(PS_LOGO_PENDING\.remove\)\{ c\.logoFileId=''; \}/.test(sv), 'removal clears the id');
  ok(/boxUploadBinary\(PS_LOGO_PENDING\.file, currentProject\.folderId\)/.test(sv), 'a new file is uploaded');
  ok(sv.indexOf('boxUploadBinary') < sv.indexOf('writeProjectConfig'),
     'the upload happens before the config is written, so the id saved is real');
  ok(/delete PICKER_LOGOS\[c\.logoFileId\]/.test(sv),
     'the cached image is dropped, or a replaced logo would keep showing the old one');
  ok(/PS_LOGO_PENDING=null/.test(sv), 'the pending state is cleared after saving');
}

// what the wizard sets and Settings now covers
{
  const covered=['owner','jobNumber','address','onsiteCM','scope','contractDate',
                 'logoFileId','boardReportsEnabled','projectAdmin'];
  const ids={owner:'ps-owner',jobNumber:'ps-jobnum',address:'ps-line1',onsiteCM:'ps-cm',
             scope:'ps-scope',contractDate:'ps-contractdate',logoFileId:'ps-logo',
             boardReportsEnabled:'ps-board',projectAdmin:'ps-admin'};
  covered.forEach(k=>ok(new RegExp('id="'+ids[k]+'"').test(html), k+' is editable in Settings'));
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-pslogo.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
