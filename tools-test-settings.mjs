// Two admin pages became one, and a project gained details that could not be
// edited after the wizard at all.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('One Settings tab');
ok('a single nav entry',            (html.match(/data-section="settings"/g)||[]).length===1);
ok('the two old entries are gone',  !html.includes('data-section="workflows"') && !html.includes('data-section="notifsettings"'));
ok('one section holds them all',    (html.match(/id="section-settings"/g)||[]).length===1);
ok('the old sections are gone',     !html.includes('id="section-workflows"') && !html.includes('id="section-notifsettings"'));
ok('four panes exist', ['project','dates','workflows','notifs'].every(k=>html.includes('id="set-pane-'+k+'"')));
ok('the workflow content survived', html.includes('id="wf-scope"'));
ok('the notification content survived', html.includes('id="nt-rfi-subject"'));
ok('the reminder content survived', html.includes('id="rem-status"'));

console.log('Architect and Engineer reach it, but only for workflows');
const st=grab('function setTab');
ok('non-admins are limited to workflows', /IS_ADMIN \? \['project','dates','workflows','notifs'\] : \['workflows'\]/.test(st));
ok('an unpermitted pane falls back',      /if\(!allowed\.includes\(name\)\) name='workflows';/.test(st));
ok('the nav entry stays readable to A\/E', /data-section="settings">Settings/.test(html) && /admin-only ae-readonly" data-section="settings"/.test(html));
ok('the other tabs are admin only',       (html.match(/class="set-tab admin-only"/g)||[]).length===3);
ok('workflows is the tab they land on',   /setTab\(IS_ADMIN \? 'project' : 'workflows'\)/.test(src));

console.log('Dates moved out of Notifications');
ok('the panel is relocated once', /function relocateDatesPanel/.test(src));
ok('it moves only when misplaced', /bar\.parentElement!==dest/.test(src));
ok('it is marked for the move',    /data-move-to="set-pane-dates"/.test(html));

console.log('Project details are editable at last');
ok('the fields exist', ['ps-owner','ps-jobnum','ps-cm','ps-contractdate','ps-scope','ps-line1','ps-city','ps-state','ps-zip'].every(id=>html.includes('id="'+id+'"')));
const sv=grab('async function saveProjectSettings');
ok('it writes the config',              /writeProjectConfig\(currentProject\.folderId, c\)/.test(sv));
ok('the address is stored as parts',    /c\.address=\{line1:/.test(sv));
// Both forms are kept in step so the document and anything older agree.
ok('the joined string is kept in step', /c\.location=\[c\.address\.line1/.test(sv));
ok('it redraws afterwards',             /renderAll\(\)/.test(sv));

console.log('Contract date replaces notice to proceed on the document');
ok('the document reads the contract date', /\['Contract date',fmtDMY\(cd\)/.test(src));
ok('notice to proceed is off the document', !/'Notice to proceed'/.test(src));
ok('but survives as a schedule milestone', /MILESTONE_NAMES = \['Notice to Proceed'/.test(src));
ok('the wizard collects it',               html.includes('id="np-contractdate"'));
ok('the wizard writes it',                 /contractDate: wizVal\('np-contractdate'\)/.test(src));
ok('and it can be changed later',          /c\.contractDate=v\('ps-contractdate'\)/.test(sv));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
