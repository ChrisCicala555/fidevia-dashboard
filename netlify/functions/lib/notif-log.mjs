// A record of every email the dashboard sends.
//
// Until now nothing was written down when a notification went out. The audit
// log records what people did to records; it says nothing about who was told.
// When a contractor says "nobody told me", there was no way to answer.
//
// One blob per day, holding an array of entries. Reading a month is thirty
// parallel gets rather than thousands, and a day nobody was emailed on costs
// nothing at all.
import { getStore } from '@netlify/blobs';

const store = () => getStore('notif-log');
const MAX_PER_DAY = 2000;
const DAY_MS = 86400000;

export function dayKey(d) {
  return new Date(d || Date.now()).toISOString().slice(0, 10);
}

// A subject line is the only thing every send path has in common, so it is
// what the log falls back to when a caller does not name its own kind.
export function classifyKind(subject) {
  const s = String(subject || '').toLowerCase();
  if (s.indexOf('monthly schedule') >= 0) return 'schedule';
  if (s.indexOf('invited') >= 0) return 'invite';
  if (s.indexOf('access request') >= 0) return 'access-request';
  if (s.indexOf('you have access') >= 0 || s.indexOf('access granted') >= 0
    || s.indexOf('been added to') >= 0 || s.indexOf('added to a project') >= 0) return 'access';
  if (s.indexOf('action required') >= 0) return 'workflow';
  if (s.indexOf('record deleted') >= 0) return 'deletion';
  if (s.indexOf('outstanding items') >= 0) return 'digest';
  if (s.indexOf('will be archived') >= 0) return 'archive';
  if (s.indexOf('rfi') >= 0) return 'rfi';
  if (s.indexOf('submittal') >= 0) return 'submittal';
  if (s.indexOf('change order') >= 0 || s.indexOf('pco') >= 0) return 'change-order';
  if (s.indexOf('payment application') >= 0 || s.indexOf('pay app') >= 0) return 'pay-app';
  return 'other';
}

export const KIND_LABEL = {
  schedule: 'Monthly schedule',
  invite: 'Invitation',
  access: 'Access granted',
  'access-request': 'Access request',
  workflow: 'Action required',
  deletion: 'Record deleted',
  digest: 'Reminder digest',
  archive: 'Archive warning',
  rfi: 'RFI',
  submittal: 'Submittal',
  'change-order': 'Change order',
  'pay-app': 'Payment application',
  other: 'Other'
};

function normalise(e) {
  const to = [...new Set((Array.isArray(e.to) ? e.to : [e.to])
    .map(x => String(x || '').trim().toLowerCase()).filter(Boolean))];
  const entry = {
    at: new Date().toISOString(),
    to,
    subject: String(e.subject || '').slice(0, 300),
    kind: e.kind || classifyKind(e.subject),
    // 'auto' is the scheduled job or a side effect of a submission; 'manual'
    // is a person pressing a button. Worth telling apart when someone asks
    // why a contractor was chased twice in a week.
    trigger: e.trigger === 'manual' ? 'manual' : 'auto',
    projectId: String(e.projectId || ''),
    project: String(e.project || '').slice(0, 200),
    by: String(e.by || '').slice(0, 200),
    ok: e.ok !== false
  };
  if (e.error) entry.error = String(e.error).slice(0, 300);
  return entry;
}

// Two sends landing in the same second must not lose one another. Netlify
// Blobs offers a conditional write, so this is a compare-and-set with a few
// retries; only if that route is unavailable does it fall back to a plain
// overwrite, which still beats not recording the send at all.
export async function logNotif(e) {
  try {
    const entry = normalise(e || {});
    if (!entry.to.length) return;
    const s = store();
    const k = dayKey();
    let last = [entry];
    for (let i = 0; i < 4; i++) {
      let cur = [], etag = null, existed = false;
      try {
        const r = await s.getWithMetadata(k, { type: 'json' });
        if (r) { cur = Array.isArray(r.data) ? r.data : []; etag = r.etag || null; existed = true; }
      } catch (err) {}
      if (cur.length >= MAX_PER_DAY) cur = cur.slice(cur.length - MAX_PER_DAY + 1);
      cur.push(entry);
      last = cur;
      try {
        const opts = existed && etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
        const res = await s.setJSON(k, cur, opts);
        if (!res || res.modified !== false) return;
      } catch (err) {
        try { await s.setJSON(k, cur); } catch (e2) {}
        return;
      }
    }
    try { await s.setJSON(k, last); } catch (err) {}
  } catch (err) {}
}

// For callers that send and want the outcome recorded either way.
export async function logSend(meta, promise) {
  try { await promise; await logNotif(meta); }
  catch (e) { await logNotif(Object.assign({}, meta, { ok: false, error: e && e.message })); }
}

export async function readNotifLog(opts) {
  opts = opts || {};
  const n = Math.min(180, Math.max(1, parseInt(opts.days, 10) || 30));
  const s = store();
  const now = Date.now();
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(dayKey(now - i * DAY_MS));
  const chunks = await Promise.all(keys.map(async k => {
    try { return (await s.get(k, { type: 'json' })) || []; } catch (e) { return []; }
  }));
  let out = [];
  chunks.forEach(c => { if (Array.isArray(c)) out = out.concat(c); });
  if (opts.projectId) out = out.filter(r => String(r.projectId || '') === String(opts.projectId));
  if (opts.kind) out = out.filter(r => String(r.kind || '') === String(opts.kind));
  out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const limit = Math.min(2000, Math.max(1, parseInt(opts.limit, 10) || 400));
  return out.slice(0, limit);
}
