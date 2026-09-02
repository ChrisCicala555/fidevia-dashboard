# Not built: Allowance Adjustment

Requested alongside the named allowances work and deliberately deferred. The
rest of that request — the allowance list in the wizard and Settings, change
orders drawing against a named allowance, and the Generate PCO rename — is
built and live. This is the remaining piece.

## What it does

Reconciles the actual cost of an allowance item against the sum carried in the
contract. The difference adjusts the contract sum up or down, and the document
records the true-up.

Rare in practice, which is why it was deferred rather than dropped.

## What it needs to state

- The allowance by letter and name, and the contract it sits in
- The carried allowance amount
- The actual cost
- The difference, and whether it increases or decreases the contract sum
- The same party addresses and signature block as the change order document

## Two decisions still open

**When it becomes available.** At closeout, when an allowance is finalised, or
at any point to true up one allowance. The first matches how the accounting
actually works; the second is more flexible.

**Whether it writes a change order row.** The contract sum moves, and today
only approved change orders reach that figure — `coContractImpactFor` sums
`coContractImpact` over approved rows.

The recommendation is that it writes a change order row flagged as an allowance
adjustment. One place computes the contract, and the adjustment appears in the
log where an auditor would look for it. The alternative is teaching
`coContractImpactFor` about a second source, which puts the contract figure in
two places.

## Where it would go

A second button on the Change Orders tab beside Generate PCO, on the same
`openCoGen` pattern — a modal that gathers the figures, then
`buildChangeOrderPDF` with an adjustment layout.

## Related

`allowancesFor`, `allowanceUsedById`, `allowanceRemainingById` already exist and
give the carried and drawn figures per allowance. The adjustment needs the
actual cost, which nothing records yet.
