// Exercises boxFetch against a fake Box that rate-limits, by stubbing global fetch.
const src = await import('fs').then(m=>m.readFileSync('netlify/functions/box-proxy.mjs','utf8'));
const body = src.slice(src.indexOf('let RATE_LIMIT_HITS'), src.indexOf('// ── LOCAL TOKEN VERIFICATION'));
const mod = await import('data:text/javascript,' + encodeURIComponent(body + '\nexport { boxFetch };'));
const { boxFetch } = mod;

let pass=0, fail=0;
const check=(name,cond,extra='')=>{ (cond?pass++:fail++); console.log((cond?'  PASS  ':'  FAIL  ')+name+(extra?'  '+extra:'')); };

// 1. 429 twice then success — should retry and return 200
let calls=0;
globalThis.fetch = async ()=>{ calls++; return calls<3
  ? new Response('', {status:429, headers:{'Retry-After':'0'}})
  : new Response('ok', {status:200}); };
let t0=Date.now();
let r = await boxFetch('https://api.box.com/2.0/x');
check('retries through 429 to success', r.status===200 && calls===3, `(${calls} calls, ${Date.now()-t0}ms)`);

// 2. Honours Retry-After over exponential default
calls=0;
globalThis.fetch = async ()=>{ calls++; return calls<2
  ? new Response('', {status:429, headers:{'Retry-After':'1'}})
  : new Response('ok', {status:200}); };
t0=Date.now(); await boxFetch('https://api.box.com/2.0/x'); const waited=Date.now()-t0;
check('waits ~1s when Retry-After: 1', waited>=1000 && waited<1600, `(waited ${waited}ms)`);

// 3. Gives up rather than hanging, returning the real 429 to the caller
calls=0;
globalThis.fetch = async ()=>{ calls++; return new Response('', {status:429, headers:{'Retry-After':'0'}}); };
r = await boxFetch('https://api.box.com/2.0/x');
check('gives up after 4 tries and returns 429', r.status===429 && calls===4, `(${calls} calls)`);

// 4. A write that 500s must NOT be replayed (it may have applied)
calls=0;
globalThis.fetch = async ()=>{ calls++; return new Response('', {status:500}); };
r = await boxFetch('https://upload.box.com/x', {method:'POST'});
check('does not retry 5xx on POST', r.status===500 && calls===1, `(${calls} call)`);

// 5. ...but a read that 500s is safe to retry
calls=0;
globalThis.fetch = async ()=>{ calls++; return new Response('', {status:500}); };
r = await boxFetch('https://api.box.com/2.0/x');
check('does retry 5xx on GET', r.status===500 && calls===4, `(${calls} calls)`);

// 6. A 409 (duplicate name) must surface immediately, not be retried away
calls=0;
globalThis.fetch = async ()=>{ calls++; return new Response('', {status:409}); };
r = await boxFetch('https://upload.box.com/x', {method:'POST'});
check('passes 409 straight through', r.status===409 && calls===1, `(${calls} call)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
