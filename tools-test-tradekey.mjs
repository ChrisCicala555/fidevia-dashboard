// "I almost feel like for contractors, we have to build by their role... then
// if a company fills multiple roles, they are given multiple payment
// applications on the dashboard."
//
// Right, and it is the identity the paperwork was already using: PCO-GC-004,
// RFI-GC-002. A job awards GC, MC, PC and EC separately and one firm can win
// two of them — mechanical and plumbing most often, both being piping trades
// out of the same shop. Keyed on the company, such a firm collided with itself.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);

// Garden Spot holds two of the four primes. Summit holds one.
const LINES=[{role:'GC', name:'Summit Builders', contract:3000000, active:true},
             {role:'MC', name:'Garden Spot', contract:500000, active:true},
             {role:'PC', name:'Garden Spot', contract:300000, active:true}];
const setup=(lines)=>P.run(`currentProject={folders:{},config:{contractors:${JSON.stringify(lines||LINES)}}};`);
const run=(js)=>{ setup(); return P.run(js); };

console.log('The trade is the key');
{
  ok(run(`tradeKeyOf({role:'MC'})`)==='MC', 'a trade code is its own key');
  ok(run(`tradeKeyOf({role:'mc'})`)==='MC', 'however it was typed');
  ok(run(`tradeKeyOf({role:''})`)==='', 'and a line with no trade has no key, rather than a blank one that matches');
  // Two unlabelled Others would collide exactly the way two companies of one
  // name do — which is the bug being fixed, so it cannot be reintroduced here.
  ok(run(`tradeKeyOf({role:'Other', label:'Roofing'})`)==='OC:ROOFING', 'an Other is keyed by its label');
  ok(run(`tradeKeyOf({role:'Other', label:'Sitework'})`)!==run(`tradeKeyOf({role:'Other', label:'Roofing'})`),
     'so two of them are two lines, not one');
  ok(run(`tradeLabelOf({role:'Other', label:'Roofing'})`)==='OC — Roofing', 'and it reads as itself on screen');
  ok(run(`tradeLabelOf({role:'PC'})`)==='PC', 'while a named trade is just its code');
}

console.log('Which lines a company holds');
{
  ok(run(`tradesForCompany('Garden Spot').join()`)==='MC,PC', 'both of Garden Spot’s primes');
  ok(run(`tradesForCompany('garden spot').join()`)==='MC,PC', 'matched however the name was cased');
  ok(run(`tradesForCompany('Summit Builders').join()`)==='GC', 'and the ordinary case is one');
  ok(run(`tradesForCompany('Nobody Ltd').length`)===0, 'a company not on the job holds nothing');
  // A half-finished contractor row carries no name. An unnamed row asking for
  // its lines must not find it by both being blank — that is two nothings
  // matching, and it would put a nameless pay application on a real contract.
  P.run(`currentProject={folders:{},config:{contractors:[
    {role:'MC', name:'Garden Spot', contract:500000, active:true},
    {role:'EC', name:'', contract:0, active:true}]}};`);
  ok(P.run(`tradesForCompany('').length`)===0, 'an empty name is not a wildcard, even against a nameless line');
  ok(P.run(`lineOfRow({'Contractor':''})`)===null, 'so a row naming no company belongs to no contract');
  ok(P.run(`tradesForCompany('Garden Spot').join()`)==='MC', 'while the named lines are unaffected');
  ok(run(`(lineForTrade('PC')||{}).name`)==='Garden Spot', 'a trade names one company');
  ok(run(`lineForTrade('EC')`)===null, 'and a trade nobody holds is null rather than an accident');
}

console.log('Which line a row is billed against');
{
  const R=(o)=>JSON.stringify(Object.assign({'Contractor':'Garden Spot'}, o));
  ok(run(`tradeOfRow(${R({'Trade':'PC'})})`)==='PC', 'the row says so');
  ok(run(`tradeOfRow(${R({'Trade':'pc'})})`)==='PC', 'however it was written');
  // The one that matters: a firm with two contracts and a row naming neither.
  ok(run(`tradeOfRow(${R({})})`)==='',
     'a row that names no trade against a company holding two is left blank — attributing it to '
     +'whichever sorted first is how the old bug read, and a blank is a question somebody can answer');
  ok(run(`tradeOfRow(${R({'Trade':'EC'})})`)==='',
     'and a trade its own company does not hold is not taken at its word');
  // Every row filed before trades were keys, and every single-contract firm.
  ok(run(`tradeOfRow({'Contractor':'Summit Builders'})`)==='GC',
     'a company with one contract needs no Trade column at all, so nothing existing has to be backfilled');
  ok(run(`lineOfRow({'Contractor':'Nobody Ltd'})`)===null, 'a row for nobody on the job belongs to no line');
  ok(run(`tradeOfRow({'Company':'Summit Builders'})`)==='GC', 'Company stands in where Contractor is absent');
}

console.log('Is this row on that line');
{
  const GS_MC=JSON.stringify(LINES[1]), GS_PC=JSON.stringify(LINES[2]), SUM=JSON.stringify(LINES[0]);
  const R=(o)=>JSON.stringify(Object.assign({'Contractor':'Garden Spot'}, o));
  ok(run(`rowOnLine(${R({'Trade':'MC'})}, ${GS_MC})`)===true, 'a mechanical row is on the mechanical line');
  ok(run(`rowOnLine(${R({'Trade':'MC'})}, ${GS_PC})`)===false,
     'and not on the plumbing one — which is the whole point, since the money must not pool');
  ok(run(`rowOnLine(${R({})}, ${GS_MC})`)===false,
     'an unattributed row counts against neither, rather than against both');
  ok(run(`rowOnLine({'Contractor':'Summit Builders'}, ${SUM})`)===true,
     'while a single-contract firm needs no trade on the row');
  ok(run(`rowOnLine(${R({'Trade':'MC'})}, ${SUM})`)===false, 'another company’s row is never on your line');
  ok(run(`rowOnLine(null, ${SUM})`)===false && run(`rowOnLine(${R({})}, null)`)===false,
     'and neither half is assumed to exist');
}

console.log('One contractor, the trades they hold ticked on it')
{
  // How somebody setting up a job thinks about it: Garden Spot is one firm that
  // holds two of the four primes, not two companies that share a name.
  P.run(`currentProject={folders:{},config:{contractors:[
    {name:'Summit Builders', role:'GC', contract:3000000, active:true},
    {name:'Garden Spot', active:true, lines:[
      {role:'MC', contract:500000},
      {role:'PC', contract:300000}]}]}};`);
  ok(P.run(`contractorLines().length`)===3, 'the ticked trades expand to one line each');
  ok(P.run(`tradesForCompany('Garden Spot').join()`)==='MC,PC', 'both of theirs');
  ok(P.run(`(lineForTrade('PC')||{}).contract`)===300000,
     'each carrying its own contract — which is the point, since the money must not pool');
  ok(P.run(`(lineForTrade('GC')||{}).name`)==='Summit Builders',
     'while a firm holding one trade is still written the old way and still works');
  ok(P.run(`tradeOfRow({'Contractor':'Garden Spot','Trade':'PC'})`)==='PC', 'rows resolve against it the same');
  ok(P.run(`rowOnLine({'Contractor':'Garden Spot','Trade':'MC'}, lineForTrade('PC'))`)===false,
     'and one trade’s rows stay off the other’s contract');
  // A trade dropped from a firm that still holds others.
  P.run(`currentProject.config.contractors[1].lines[1].active=false;`);
  ok(P.run(`tradesForCompany('Garden Spot').join()`)==='MC', 'a trade can be retired without retiring the firm');
}

console.log('An inactive line is not a line');
{
  P.run(`currentProject={folders:{},config:{contractors:[
    {role:'MC', name:'Garden Spot', contract:500000, active:true},
    {role:'PC', name:'Garden Spot', contract:300000, active:false}]}};`);
  ok(P.run(`tradesForCompany('Garden Spot').join()`)==='MC',
     'a deactivated contract drops out, the same as everywhere else');
  ok(P.run(`tradeOfRow({'Contractor':'Garden Spot'})`)==='MC',
     'which puts the company back to one line, so its untagged rows resolve again');
}

console.log(bad ? `FAIL tools-test-tradekey.mjs — ${bad} of ${n}` : `ok   tools-test-tradekey.mjs — ${n} assertions`);
process.exit(bad?1:0);
