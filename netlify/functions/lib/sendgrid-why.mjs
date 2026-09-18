// What a SendGrid status actually means, for somebody reading the notification
// log rather than SendGrid's API reference.
//
// The log said "SendGrid 401" against every failed send, which is true and
// tells a reader nothing about what to go and change. Worse, a key that had
// been revoked and a SENDGRID_KEY nobody had set produced the same 401, and
// those are fixed in different places.
export function sendGridWhy(status){
  // Billing is named FIRST, and from experience: every send failed 401 for
  // hours while the key, the environment variable, the IP rules and the repo
  // were all checked and all turned out fine. A card SendGrid could not charge
  // rejects a perfectly good key exactly like a revoked one does — and the
  // invoice still reads "Paid", so the billing page does not look wrong either.
  if (status === 401) return 'SendGrid 401 — the key was rejected. Check billing first: a failed payment rejects a valid key. Otherwise the key has been revoked or regenerated, or SENDGRID_KEY on the server is wrong.';
  if (status === 403) return 'SendGrid 403 — the key is valid but not allowed to send. Check its Mail Send permission and the verified sender address.';
  if (status === 413) return 'SendGrid 413 — the message was too large, usually an attachment.';
  if (status === 429) return 'SendGrid 429 — too many messages too quickly. It should work again shortly.';
  if (status >= 500)  return 'SendGrid ' + status + ' — SendGrid had a problem at their end. The send can be retried.';
  return 'SendGrid ' + status;
}
// Told apart from a rejected key, because 'Bearer undefined' is also a 401.
export const NO_KEY = 'No SendGrid key is set on the server (SENDGRID_KEY).';
export function sendGridKeyMissing(){ return !String(process.env.SENDGRID_KEY || '').trim(); }
