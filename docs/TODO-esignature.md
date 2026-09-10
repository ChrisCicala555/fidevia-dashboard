# Parked: e-signature on documents

> Part of the outstanding list in `TODO.md`. Raised 10 Sep 2026.

## What is wanted

One document, held in one place, that every party signs in turn — not a file
passed from person to person with each one downloading, signing and re-uploading
a new copy.

Today the dashboard records **approval**: who advanced which workflow step, when,
and under whose name. That is a real audit trail and it is not nothing. What it
does not produce is a **signature on the paper itself**. For a change order that
an owner may later rely on, the signed instrument is the thing that matters, and
right now that instrument is assembled by hand outside the dashboard.

The good news is that the vendor model matches the requirement almost exactly.
An e-signature "envelope" is a container: one package of documents, several
recipients, a routing order, and one tamper-sealed result with a certificate of
completion. That is the described behaviour, not an approximation of it. The
routing order maps directly onto the workflow step groups the dashboard already
computes.

## What was researched (10 Sep 2026)

**DocuSign** publishes developer plans: Starter $50/mo ($600/yr) for 40
envelopes a month, Intermediate $300/mo for 100, Advanced $480/mo for 100 plus
extras. Above that it is Enhanced — custom quote, five-user minimum,
1-877-720-2040.

**Adobe** publishes only seat licences (Acrobat Standard/Pro/Studio for teams,
$16.99–$29.99 per licence per month). None of them include API access. The API
product is Acrobat Sign Solutions, which is quote-only: 800-915-9430.

So at any serious volume both are a sales conversation rather than a checkout
page. Challengers worth quoting alongside: Dropbox Sign, BoldSign, SignWell,
SignNow. Every published comparison of these was written by a company selling
one of them, so the numbers in them are not reliable — get quotes.

Self-hosted open source (Documenso, OpenSign) removes per-envelope cost
entirely, which at five-figure annual volume is material. The trade is owning
compliance, audit-trail integrity and uptime. Reasonable for internal records;
a real question for anything an owner will rely on in a dispute.

### Counting

An envelope counts **when sent**, not when completed — a declined or voided one
still counts. A decline voids the envelope for every recipient, so a long
signature chain is more fragile than a short one. Bulk Send is the exception to
the container rule: one document to N independent recipients counts N times.

### The volume question, which decides everything

Christopher estimated hundreds of change orders a month. Before any sales call,
settle whether that is **PCOs raised** or **change orders executed**. The
dashboard already separates them, and a proposal does not need a signature —
only the executed change order does. The two numbers could differ by an order of
magnitude, and it is the second one that gets quoted against.

Pay applications are a separate decision and a bigger one: a G702/G703 often
needs notarisation, which is a different product and a step up in cost. Change
orders alone is a much smaller job.

## Notes for whoever builds it

More than half the plumbing exists. `pay_apps` already carries `Signed File ID`
and `Signed File Name`. The workflow engine already knows who signs, in what
order, and whether a group needs everyone. The change order generator produces
the PDF with jsPDF, so anchor strings for signature tabs can be baked in rather
than placed by coordinate. Netlify Functions hold server-side secrets already;
Box already versions files.

Three things to be careful about:

1. **Uploaded documents have no anchors.** When Fidevia generates the change
   order the PDF is ours and tabs can be placed reliably. When an architect
   uploads their own, nobody knows where the signature line is — so either
   somebody places tabs by hand, or a signature block is appended.

2. **The webhook is where the bugs will be.** Completion callbacks retry, so the
   same completion arrives twice. This codebase has already produced a stale-index
   write and a positional-row bug; a duplicate delivery that advances a workflow
   step twice is exactly the failure mode to expect. Idempotency on envelope id,
   and a test for double delivery, before anything else.

3. **Go-live is calendar time.** Demo envelopes are not legally valid. DocuSign
   gates production behind a review requiring successful demo calls. Budget for
   the gap between "it works" and "it counts".

**Build it behind a thin interface** — `sendForSignature(pdf, signers)` plus a
webhook normaliser — so the vendor lives in one file. Both leading options are
quote-only, which means renegotiation is routine and switching should be a
config change rather than a rewrite. This costs almost nothing up front and is
the single decision most likely to matter in two years.
