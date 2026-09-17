# Outstanding items

Two lists. The first is things only you can do — they need an account somebody
owns, or a decision, and no amount of code changes them. The second is work
that is mine, parked with a reason.

Last updated 10 Sep 2026, build 2026-09-10 21:20.

---

## Needs you

### 1. Finalise the SendGrid account

Every email the dashboard sends goes through SendGrid, authenticated by
`SENDGRID_KEY` in Netlify's environment variables, sending as
`FROM_EMAIL` (defaulting to `dashboard@fidevia.com`).

What to settle:

- **Which account and which plan.** The old permanent free tier was retired;
  what exists now is a time-limited trial, so a trial key will stop working on
  a date rather than degrading. Check Settings → Account Details in SendGrid.
- **Sender authentication for fidevia.com.** Until the domain is authenticated
  with SPF and DKIM, mail from `dashboard@fidevia.com` is far more likely to
  land in spam — which looks identical, from the dashboard, to an email that
  was never sent.
- **Who owns the account.** It should not be tied to a personal login that
  leaves with one person.
- **The key in Netlify** should be the one belonging to the final account, not
  a trial key that gets forgotten.

Related, and mine to build if you want it: nothing warns you when sends start
failing. A rejected send records `SendGrid {status}` in the Notification Log
and stops there. A quota or authentication failure would show up as 401 or 429
entries that nobody is looking at. I can surface repeated failures on the Home
tab so this announces itself rather than being discovered when a contractor
says they never got the email.

### 2. Auth0 — logins, password resets, the dev tenant

Full detail in `TODO-auth0-logins.md`. In short: the password-reset template is
written and needs pasting into Auth0 → Branding → Email Templates; the reset
links still come from the `dev-…auth0.com` tenant rather than
`login.fidevia.com`; and a password set through that flow did not work at
sign-in, which is unexplained and is the part that actually blocks somebody.

### 3. Re-create three items carrying bad workflow data

`SUB-GC-001`, `SUB-GC-002` and `RFI-GC-001` were written by earlier versions of
the workflow code and hold states the current code did not produce and cannot
fully repair. The healing functions patch what they can, but these three will
keep reading oddly. Deleting and re-creating them is cleaner than any fix I can
write — and now that a delete moves the documents to the module's bin rather
than stranding them, nothing is lost by doing it.

### 4. Seed the month folders on Ithaca

Open Contractor Daily Reports, Certified Payrolls and Daily Logs once each as
Fidevia. The folders back to Notice to Proceed are created on that first visit;
after that each new month appears on its own.

---

## Parked, mine

Reasons matter here — none of these are forgotten, each was set down on
purpose.

| Item | Why it is parked |
|---|---|
| Allowance Adjustment document (`TODO-allowance-adjustment.md`) | The arithmetic now exists: a deduct tied to an allowance writes it down and reduces the contract. What is left is the document itself — the paper that records the reconciliation |
| Who owns schedule updates; projected vs actual milestone dates (`TODO-schedule-ownership-and-projected.md`) | Both need a decision from you about how the project is run, not a technical one |
| E-signature: one document all parties sign (`TODO-esignature.md`) | The requirement is settled and the vendor model fits it. Blocked on a volume figure — PCOs raised vs change orders executed — because that is what any quote is priced against |
| A Recently Deleted view in the dashboard, with restore | The documents already survive a delete — they move to the module's Deleted folder in Box. What is missing is the dashboard end: somewhere the deleted records are listed, and a way to put one back without opening Box. Wants a retention window (30 days, then it stops being offered) and a decision on who may restore. Parked because deleting is still rare and the documents are not at risk in the meantime |
| `[Fidevia]` prefix on the invite and "added to" emails | The only two without it. Looks accidental, but changing it changes mail people have already been trained to look for |
| More notification subjects editable in Settings | Only new RFI, CO and submittal are editable today. Waiting on your marked-up copy of the notification emails document |
| Chase and reminder emails for payment application reviews | The chain itself now runs: a review signs its step, moves to the next group, reaches Needs Your Attention and emails whoever it has landed on. What the other modules have and this does not is the nagging — the scheduled reminder when a step has sat unanswered, and the overdue flag against the billing cycle's dates |
| "Revise & Resubmit" (change orders) vs "Revise and Resubmit" (submittals) | Harmless inconsistency, but it means two spellings in reports |
| Sweep the remaining positional-index write paths | Delete and archive were fixed to address records by id. Pay-app actions still use array position, which a stale page can get wrong |
| A review or signature chain on any document, not just the four modules | Christopher: a drawing lands in the ASI folder and somebody has to sign it or review it, but it is not an RFI, a submittal, a change order or a payment application, so there is nowhere to say so. What he wants is to point at a file in Documents, choose who it goes to, and have the notification emails carry it — "I submitted this, it's with you now" — with the same chase and reminder behaviour the modules already have. Most of the machinery exists: the step chains, the signed record of who approved what, the override, the item emails. What is missing is a workflow that hangs off a Box file rather than a CSV row, which is a different shape from everything built so far, and a decision about where the record of it lives |
| A standalone generator, outside any project | Christopher wants to produce a one-off change order or daily report for work that is not on the dashboard — upload or type the details, get the document, no project required. It reuses the two document builders as they are; what it needs is the surrounding information they currently read off a project: the parties and their addresses, the contract sum for a change order, the job name and date for a daily report. So the work is a form, a place to keep the one-offs in Box, and a decision about whether they are numbered at all |
| A proposal document headed CHANGE ORDER | Generating the proposal before the review is finished is now warned about where it matters — the executed document — but the PDF drawn from an unapproved row is still headed `CHANGE ORDER No. PCO-GC-001`, whatever the button said. It should say PROPOSED CHANGE ORDER when there is no CO number |
| A PCO absorbing proposals before it is approved | Proposals ticked to be rolled into an unapproved row are closed out against it — marked "Rolled into PCO-GC-001" and their own reviews stopped — so approved work is absorbed by something not yet approved and cannot be covered by anything else until that PCO becomes a change order. Needs a decision from you on whether rolling should require the covering row to be approved first |
| Retire the dead `docs` module and its `07 - Documents` folder | Two Box folders are called Documents. `12 - Documents` is the live one; `07 - Documents` belongs to the `docs` module, left behind when that tab was rebuilt. It has no nav item, no section and no table — renderDocuments() looks for an element that does not exist and returns on every redraw — but it still creates a folder on every new project, still has an upload form nothing opens, and its `Document Index.csv` is still on the server's readable list. Its label was changed to Drawings & Specs at some point while the folder kept the old name, which is why the two collide. Retiring it means: stop creating the folder, drop the module, drop the dead form, remove the CSV from the allowlist. New projects would then run 01-06, 08-14 with no 07; closing that gap would mean renaming folders on every existing project, which is not worth it. Christopher: "not that big of a deal." Check what is actually in 07 on each project before removing anything — an older one may have real documents filed there |
| A clearances section in the Documents tab | Christopher, 16 Sep: "a clearance section into the documents tab". Recorded as asked; what a clearance is here needs pinning down before anything is built. The likeliest reading, given the school district work, is the Pennsylvania background clearances — Act 34 criminal history, Act 151 child abuse, Act 114 FBI — that every worker on a school site has to hold, each with its own expiry. If that is it, the shape is not a folder: it is a roster of people, with a document and a date against each, something that says who is clear to be on site today and who lapses this month, and a chase when one is about to. That is much closer to the Schedule tab's "who still owes one" than to a Documents folder, and it would want its own answer to who may see another company's workers' paperwork. The other readings — utility or inspection clearances, sign-offs releasing an area for work — are a different thing entirely and would be closer to the ASI review chain already parked above. Ask before starting |
| A better way to get documents into the dashboard | Christopher, 16 Sep: "a unique way of uploading documents". Too thin to act on as written, and worth asking about rather than guessing, because the plausible readings lead to different builds: a drop zone that takes a pile of files at once and files them by name; an email-in address per project so a contractor can forward paperwork without logging in; a scan-and-file path from a phone; or a link handed to somebody who has no account at all. The first is the smallest and would be quick. Ask which problem this is solving before picking one |
| An admin panel for unmatched access requests | Requests that match no project currently go nowhere visible |
| Sweep brittle test assertions | Several tests match exact code text and have broken on harmless edits. They should assert behaviour |
