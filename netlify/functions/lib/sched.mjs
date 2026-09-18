// What a monthly schedule is for, and whether it has arrived.
//
// There is one shared Schedules folder, so the folder cannot say whose a file
// is or what month it covers. The name has to carry both, which is why the
// uploader is asked for a period and the file is written as
// "<Company> — <Month> <Year>.<ext>". Everything here reads that name.
//
// This lives in lib/ because Netlify treats every top-level file in
// netlify/functions as its own function. Two callers share it: the dashboard
// panel, through box-proxy, and the nightly chase in reminders. They each
// carried their own copy and had already drifted apart — the chase was still
// looking in a per-company folder that no longer exists, so it found nothing
// for anybody and would have emailed every contractor every month however
// many schedules they had posted.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const norm = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// "Summit Builders — September 2026.pdf" -> "2026-09".
// Returns '' when the name does not carry one, which is every file uploaded
// before the period was asked for.
export function periodFromName(name) {
  const s = String(name || '');
  const m = s.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m) {
    const i = MONTHS.findIndex(x => x.toLowerCase() === m[1].toLowerCase());
    if (i >= 0) return m[2] + '-' + String(i + 1).padStart(2, '0');
  }
  // Also accept 2026-09 and 09-2026, which is what someone naming a file by
  // hand tends to reach for.
  const iso = s.match(/(20\d{2})[-_.](0[1-9]|1[0-2])(?!\d)/);
  if (iso) return iso[1] + '-' + iso[2];
  const rev = s.match(/(?:^|[^\d])(0[1-9]|1[0-2])[-_.](20\d{2})(?!\d)/);
  if (rev) return rev[2] + '-' + rev[1];
  return '';
}

// A firm can hold two primes, and a GC programme and an MC programme are
// different documents against different contracts. The folder cannot say which
// contract a file is for any more than it can say whose it is, so the name
// carries that too: "<Company> \u2014 <TRADE> \u2014 <Month> <Year>.<ext>".
export function tradeFromName(name, trades) {
  const s = String(name || '');
  // Longest first. The delimiter check below is what actually stops a short
  // code being found inside a long one, so this changes no answer \u2014 it is here
  // so the result does not depend on the order the caller happened to build the
  // list in, which is the kind of thing that only shows up once.
  const list = (trades || []).map(t => String(t || '').trim().toUpperCase())
    .filter(Boolean).sort((a, b) => b.length - a.length);
  for (const t of list) {
    // Delimited, never inside a word: "MC" must not be found in the "Mc" of
    // "McKinley Mechanical", which is exactly the kind of name this trade has.
    const re = new RegExp('(^|[^A-Za-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                          + '([^A-Za-z0-9]|$)', 'i');
    if (re.test(s)) return t;
  }
  return '';
}

// The files that count for one contract.
//
// A file naming no contract counts for every one the firm holds. That is the
// rule a payment application filed before the column existed follows, and for
// the same reason: a firm that HAS posted a programme must not read as though
// it has posted none, and be chased for it. The panel says which files do not
// name a contract so the next one can.
export function filesForContract(files, trade, trades) {
  const list = files || [];
  const held = (trades || []).filter(Boolean);
  // No contract asked for means everything. A firm holding one needs no guard
  // of its own: with a single trade in the list the only answers are that trade
  // and blank, and the filter below keeps both.
  if (!trade) return list;
  const want = String(trade).trim().toUpperCase();
  return list.filter(f => {
    const t = tradeFromName(f && f.name, held);
    return !t || t === want;
  });
}

export function periodLabel(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  return (MONTHS[parseInt(m[2], 10) - 1] || '') + ' ' + m[1];
}

export function periodOfDate(d) {
  const x = d instanceof Date ? d : new Date(d || Date.now());
  return x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0');
}

// Newest first. A schedule revised in Box without being re-uploaded is still
// the same file, so created_at is the honest measure of when it was handed
// over. That is a fact about delivery, and stays the submission date.
export function newestFirst(files) {
  return (files || []).slice().sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// Has this contract given us the schedule for `wantPeriod`?
//
// The period the uploader named decides it, not the day the file happened to
// land. Posting October's programme on the 30th of September is not late, and
// re-posting an old one in October is not current — judging by upload date got
// both of those backwards. Files with no period on the name predate the
// question, so they fall back to the upload date rather than being called
// missing.
export function scheduleState(files, wantPeriod, since) {
  const sorted = newestFirst(files);
  if (!sorted.length) return { state: 'never' };
  const forWanted = wantPeriod ? sorted.find(f => periodFromName(f.name) === wantPeriod) : null;
  const chosen = forWanted || sorted[0];
  const period = periodFromName(chosen.name);
  const when = String(chosen.created_at || '').slice(0, 10);
  const current = forWanted ? true : (!period && !!since && !!when && when >= since);
  return {
    state: current ? 'current' : 'stale',
    fileName: chosen.name || '',
    period,
    periodLabel: periodLabel(period),
    date: when,
    count: sorted.length
  };
}
