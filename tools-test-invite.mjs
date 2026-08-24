// Adding someone to a project should tell them. Fidevia staff should never be
// invited to create an account they already have.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };
fs.writeFileSync('.inv.tmp.mjs', grab('function contactNeedsInvite')+'\nexport { contactNeedsInvite };\n');
const { contactNeedsInvite } = await import('./.inv.tmp.mjs');

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

console.log('Who gets invited');
ok('an external contact does',            contactNeedsInvite({Email:'chris@summitbuilders.com'})===true);
ok('a gmail contact does',                contactNeedsInvite({Email:'consultcjc@gmail.com'})===true);
ok('a Fidevia address does not',          contactNeedsInvite({Email:'amartin@fidevia.com'})===false);
ok('Fidevia in mixed case does not',      contactNeedsInvite({Email:'AMartin@Fidevia.COM'})===false);
ok('a padded Fidevia address does not',   contactNeedsInvite({Email:'  amartin@fidevia.com  '})===false);
ok('a blank email does not',              contactNeedsInvite({Email:''})===false);
ok('a missing email does not',            contactNeedsInvite({})===false);
ok('a null row does not',                 contactNeedsInvite(null)===false);
ok('a value with no @ does not',          contactNeedsInvite({Email:'not an address'})===false);
ok('a leading @ does not',                contactNeedsInvite({Email:'@fidevia.com'})===false);
// A lookalike domain is a different company and should still be invited.
ok('fidevia.com.example.org does',        contactNeedsInvite({Email:'x@fidevia.com.example.org'})===true);
ok('notfidevia.com does',                 contactNeedsInvite({Email:'x@notfidevia.com'})===true);

console.log('Wiring');
ok('the single-contact add notifies',        /key==='contacts'\).*notifyContactAdded/s.test(src));
ok('the notify runs after the audit entry',  src.indexOf("auditLog('Created'") < src.indexOf('notifyContactAdded(newRow'));
ok('the wizard offers an opt-out',           html.includes('id="np-invite"'));
ok('the wizard opt-out defaults to on',      /id="np-invite" checked/.test(html));
ok('the wizard invites only after the project is written',
   src.indexOf('await writeProjectConfig(projId, config)') < src.indexOf('for(const c of contacts){ if(await notifyContactAdded'));
ok('the manual Invite button shares the same rule', /contactInvite\(r,i\)\{\s*return contactNeedsInvite\(r\)/.test(src));
ok('sending never blocks the save',          /async function notifyContactAdded[\s\S]*?catch\(e\)\{ return false; \}/.test(src));

fs.rmSync('.inv.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
