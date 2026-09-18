// "Can we close the unassigned accounts and then start a new table with A and
// below?"
//
// Eleven of them sat between the search box and the letter A, so the directory
// opened on a list of people who are not on anything. The count is the part
// that wanted noticing; the names can wait until asked for.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const P=bootPage('index.html'); P.run(SEED);

const seed=()=>P.run(`CD_UN_OPEN=false; CD_UNLOCKED=false;
  document.getElementById('cd-search').value='';
  // projects is a COUNT, and a row is identified by sub.
  CONTACT_DIR=[
    {sub:'u1', name:'Tom Becker', company:'Keystone Engineering', role:'Structural Engineer',
     email:'tbecker@keystone-demo.test', phone:'', projects:0},
    {sub:'u2', name:'Maria Chen', company:'Comfort Systems', role:'Mechanical Contractor',
     email:'maria.chen@comfort-demo.test', phone:'', projects:0},
    {sub:'a1', name:'Amy Archer', company:'Archer Co', role:'Architect',
     email:'amy@archer.test', phone:'', projects:1},
    {sub:'b1', name:'Brian Bell', company:'Bell Co', role:'Engineer',
     email:'brian@bell.test', phone:'', projects:2}];
  renderContactDir(); 1;`);
const html=()=>P.run("document.getElementById('cd-list').innerHTML");
const cards=()=>(html().match(/class="cd-card"/g)||[]).length;

console.log('It opens shut');
seed();
ok(/Unassigned accounts/.test(html()), 'the band is there');
ok(/>2</.test(html()), 'with the count, which is the part worth noticing');
ok(!/Tom Becker/.test(html()) && !/Maria Chen/.test(html()), 'and none of the names');
ok(/Amy Archer/.test(html()) && /Brian Bell/.test(html()), 'while the directory itself is listed');
ok(/Click to see them/.test(html()), 'and it says how to open it');

console.log('And nobody is listed twice');
// The groups were built from the whole list and the unassigned were removed
// from it afterwards, so the groups kept them: an unassigned account appeared
// in the band at the top AND under its own letter.
P.run("cdToggleUnassigned()");
ok((html().match(/Tom Becker/g)||[]).length===1, 'Tom Becker appears once, not once per section');
{
  // B exists, for Brian Bell. What matters is that it does not also hold Tom.
  const az=html().slice(html().indexOf('cd-card', html().indexOf('cd-card')+1));
  ok(!/Tom Becker/.test(az), 'and the A-Z does not hold him under B as well');
}
P.run("cdToggleUnassigned()");

console.log('The A-Z is a table of its own');
ok(cards()===2, 'two tables, not one');
ok(html().indexOf('Unassigned accounts') < html().indexOf('cd-card', html().indexOf('cd-card')+1),
   'the unassigned one first');
{
  const second=html().slice(html().indexOf('cd-card', html().indexOf('cd-card')+1));
  ok(/<thead>/.test(second), 'the A-Z table carries its own column headings');
  ok(/Amy Archer/.test(second), 'and the people in it');
  ok(!/Tom Becker/.test(second), 'and nobody unassigned');
}

console.log('Opening it');
P.run("cdToggleUnassigned()");
ok(/Tom Becker/.test(html()) && /Maria Chen/.test(html()), 'the names appear');
ok(cards()===2, 'still two tables');
{
  const first=html().slice(0, html().indexOf('cd-card', html().indexOf('cd-card')+1));
  ok(/<thead>/.test(first), 'and now it has headings of its own too');
  ok(/found the sign-up page/.test(first), 'with the explanation of what they are');
}
P.run("cdToggleUnassigned()");
ok(!/Tom Becker/.test(html()), 'and it shuts again');

console.log('A search opens it, because a hidden match reads as no match');
seed();
P.run("document.getElementById('cd-search').value='becker'; renderContactDir();");
ok(/Tom Becker/.test(html()), 'the match is shown though the band was shut');
ok(P.run("CD_UN_OPEN")===false, 'without changing what it goes back to');
P.run("document.getElementById('cd-search').value=''; renderContactDir();");
ok(!/Tom Becker/.test(html()), 'and clearing the search shuts it again');

console.log('Searching for somebody on no project finds them');
// The A-Z empties and the unassigned are not in it, so this said "No contacts
// match your search" about a person the search had just matched.
seed();
P.run("document.getElementById('cd-search').value='keystone'; renderContactDir();");
ok(!/No contacts match/.test(html()), 'it does not claim there is no match');
ok(/Tom Becker/.test(html()), 'and shows the person');

console.log('Nobody unassigned');
P.run(`CONTACT_DIR=[{sub:'a1', name:'Amy Archer', company:'Archer Co', role:'Architect',
    email:'amy@archer.test', phone:'', projects:1}];
  CD_UN_OPEN=false; document.getElementById('cd-search').value=''; renderContactDir(); 1;`);
ok(!/Unassigned accounts/.test(html()), 'no band at all');
ok(cards()===1, 'and one table, not an empty one above it');

console.log(`\n${n-bad} passed, ${bad} failed`);
process.exit(bad?1:0);
