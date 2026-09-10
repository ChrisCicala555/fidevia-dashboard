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
| Allowance Adjustment document (`TODO-allowance-adjustment.md`) | Needs the form of the document settled first |
| Who owns schedule updates; projected vs actual milestone dates (`TODO-schedule-ownership-and-projected.md`) | Both need a decision from you about how the project is run, not a technical one |
| Restore something from a Deleted folder | Recovery is currently manual: move the folder back in Box, re-create the row. Worth building only if it happens more than rarely |
| `[Fidevia]` prefix on the invite and "added to" emails | The only two without it. Looks accidental, but changing it changes mail people have already been trained to look for |
| More notification subjects editable in Settings | Only new RFI, CO and submittal are editable today. Waiting on your marked-up copy of the notification emails document |
| Payment applications have workflow columns but no workflow UI | The columns are written and unused; either wire them up or drop them, and that is a product decision |
| "Revise & Resubmit" (change orders) vs "Revise and Resubmit" (submittals) | Harmless inconsistency, but it means two spellings in reports |
| Sweep the remaining positional-index write paths | Delete and archive were fixed to address records by id. Pay-app actions still use array position, which a stale page can get wrong |
| An admin panel for unmatched access requests | Requests that match no project currently go nowhere visible |
| Sweep brittle test assertions | Several tests match exact code text and have broken on harmless edits. They should assert behaviour |
