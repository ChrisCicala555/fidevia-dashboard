// Adding someone to a project should tell them — but the message has to match
// their situation. Inviting someone who already has an account tells them to do
// something they have done, on an address that is already taken.
import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');
const src=html.slice(html.lastIndexOf('<script>')+8, html.lastIndexOf('</script>'));
const grab=(sig)=>{ const i=src.indexOf(sig); let d=0,on=false,j=i;
  for(;j<src.length;j++){ if(src[j]==='{'){d++;on=true;} else if(src[j]==='}'){d--; if(on&&d===0){j++;break;}} }
  return src.slice(i,j); };

fs.writeFileSync('.inv.tmp.mjs', [
  "export let ACCOUNT_EMAILS=new Set();",
  "export function setAccounts(list){ ACCOUNT_EMAILS=new Set(list.map(e=>e.toLowerCase())); }",
  grab('function contactEmail'), grab('function contactMailable'),
  grab('function contactIsFidevia'), grab('function contactHasAccount'),
  grab('function contactNeedsInvite'),
  "export { contactNeedsInvite, contactHasAccount, contactIsFidevia, contactMailable };"
].join('\n'));
const m = await import('./.inv.tmp.mjs');
const { contactNeedsInvite, contactHasAccount, setAccounts } = m;

let pass=0, fail=0;
const ok=(n,c)=>{ c?pass++:(fail++,console.log('  FAIL: '+n)); };

setAccounts(['clymerllc@gmail.com','theintergalacticinvestments@gmail.com','dcicala@fidevia.com']);

console.log('Who still needs an invitation');
ok('an external contact with no account does',  contactNeedsInvite({Email:'dchen@example.com'})===true);
ok('an external contact WITH an account does not', contactNeedsInvite({Email:'clymerllc@gmail.com'})===false);
ok('account match ignores case',                contactNeedsInvite({Email:'ClymerLLC@Gmail.com'})===false);
ok('account match ignores padding',             contactNeedsInvite({Email:'  clymerllc@gmail.com '})===false);
ok('a Fidevia address never does',              contactNeedsInvite({Email:'amartin@fidevia.com'})===false);
ok('a Fidevia address with an account never does', contactNeedsInvite({Email:'dcicala@fidevia.com'})===false);
ok('a blank email does not',                    contactNeedsInvite({Email:''})===false);
ok('a missing email does not',                  contactNeedsInvite({})===false);
ok('a null row does not',                       contactNeedsInvite(null)===false);
ok('a value with no @ does not',                contactNeedsInvite({Email:'not an address'})===false);
ok('a lookalike domain still does',             contactNeedsInvite({Email:'x@notfidevia.com'})===true);

console.log('Account detection');
ok('recognises a known account',   contactHasAccount({Email:'theintergalacticinvestments@gmail.com'})===true);
ok('unknown address is no account',contactHasAccount({Email:'stranger@example.com'})===false);

console.log('The button');
ok('is hidden until the account list has loaded', /if\(!ACCOUNTS_LOADED\) return '';/.test(src));
ok('the load sets the flag',        /ACCOUNTS_LOADED=true;/.test(src));
ok('the button shows progress',     /withBusy\(event,\\?'Sending/.test(src));
ok('the manual button reuses the same decision', /notifyContactAdded\(r,/.test(grab('async function inviteContact')));
ok('the manual button no longer double-confirms', !/confirm\('Send a dashboard invitation/.test(src));

console.log('Which message is sent');
const notify=grab('async function notifyContactAdded');
ok('Fidevia addresses are skipped',        /contactIsFidevia\(row\)/.test(notify));
ok('account holders get the added notice', /addedEmailHTML/.test(notify));
ok('everyone else gets the invitation',    /inviteEmailHTML/.test(notify));
ok('the two subjects differ',              /You\\u2019ve been added to/.test(notify) && /You\\u2019re invited/.test(notify));
ok('accounts are fetched before deciding', /await ensureAccounts\(\)/.test(notify));
ok('sending never blocks the save',        /catch\(e\)\{ return false; \}/.test(notify));

const added=grab('function addedEmailHTML');
ok('the added notice does not say create an account', !/create a free account/i.test(added));
ok('the added notice offers to open the dashboard',   /Open the Dashboard/.test(added));
ok('the invitation still says create',                /Create Your Account/.test(grab('function inviteEmailHTML')));

fs.rmSync('.inv.tmp.mjs',{force:true});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
