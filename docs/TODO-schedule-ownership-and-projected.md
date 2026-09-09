# Not built: schedule ownership, and projected vs actual dates

Two requests, deliberately deferred. They are filed together because they meet
in the same table: both are about the milestone list saying who is speaking and
whether they are reporting or forecasting.

---

## 1. Who is responsible for schedule updates

### What was asked

Some way of recording who owns keeping the schedule current — the milestone
dates, and by extension whose monthly programme is late.

### What exists today

Nothing names an owner. The dashboard knows two adjacent things:

- **Who last edited the milestones.** `milestonesUpdatedAt` /
  `milestonesUpdatedBy` on the project config, shown under the table as "Last
  updated ... by ...". That is provenance after the fact, not responsibility
  before it.
- **Which contracts owe a monthly programme.** Every active prime, from
  `config.contractors`. The Schedule tab lists one card each and chases the
  ones that are behind. That is an obligation per company, with no person
  attached.

So today the answer to "who is chasing this" is "Fidevia", and the answer to
"who owes it" is "the contract" — and neither is written down anywhere a person
could be named.

### The decision to make first

Whether responsibility is **per project** (one person owns the schedule for the
whole job) or **per milestone** (different people own different dates —
realistic on a job where the GC owns mobilisation and the owner owns Notice to
Proceed). Per milestone is more truthful and more work; per project is one
field and would cover the common case.

A related question: is the owner a *person* or a *company*? The workflow steps
name individuals and that has caused trouble already — a different architect at
the same firm cannot act on a step. Naming a company here would avoid repeating
that, at the cost of not being able to email one person.

### Where it would go

- A field on the project config, set in **Settings → Project** beside Project
  administrator, which is the existing "who is answerable" field and the right
  neighbour for it.
- Shown under the milestone table next to the last-updated line.
- If per milestone: a fourth column in the Edit Schedule modal (`schRow`), and
  a column in the table.

### What it would let us do that we cannot now

Address the schedule chase to a named person rather than to everyone at the
company with the notify flag; put "the schedule has not been touched in N
weeks" on that person's Needs Your Attention rather than nobody's.

---

## 2. A column distinguishing projected from actual

### What was asked

Another column in the schedule table identifying when a date is projected
rather than actual.

### What exists today, and why this is a real ambiguity rather than a gap

The milestone table has three date columns: **Actual Date**, **Contract Date**,
**Deviation**. There are only two stored fields:

```
{ name, contract, baseline }
```

`Actual Date` renders `m.baseline`. The field is called baseline, the column is
labelled Actual, and `Deviation` is `baseline − contract`. The Edit Schedule
modal labels the same input "Actual".

So one cell is already doing two jobs. Before a milestone happens, whatever is
typed there is a forecast; after it happens, it is a record. The table calls it
Actual in both cases, and the deviation figure is computed identically either
way — a projected two-week slip and a two-week slip that actually happened are
reported in the same words.

This is also why the field is named `baseline`: it was a baseline schedule date
first, and was relabelled Actual without being renamed or split.

### What it needs

Three columns rather than two, or two columns and a flag:

- **Contract** — unchanged, the date in the agreement
- **Projected** — the current forecast, moves as the job runs
- **Actual** — set once, when the milestone is met, and does not move after

With deviation computed against whichever of Projected/Actual is populated, and
labelled so the reader knows which it is comparing. An actual date should
probably lock the projected one, or at least stop it being shown, since a
forecast for something that has already happened is noise.

### Migration

Existing `baseline` values are ambiguous — some are forecasts, some are records
of dates already met. The honest migration is to move `baseline` into
**Projected** for milestones whose date is in the future and into **Actual**
for those in the past, and say so on the tab once, rather than guessing
silently. A project set up but never updated has `baseline:''` throughout
(`wizGatherMilestones` writes empty), so most rows are unaffected.

### What else reads these fields

- `scheduleStats()` — the KPI header. Uses **contract** dates only, so it is
  unaffected by this split. Worth keeping that way: the construction duration
  should not move because somebody revised a forecast.
- `index.html:8236` — `m.baseline || m.contract` as the substantial completion
  date printed on a generated change order. This one needs a decision: a change
  order should probably state the contract date, or the actual if the milestone
  has been met, but not a forecast.

---

## Related, and worth settling at the same time

The two schedule start dates already disagree by design, and a third
interpretation would make it worse:

- `scheduleStats()` measures duration from **Mobilize**, falling back to Notice
  to Proceed — the construction clock.
- `scheduleObligationStart()` uses the **earlier** of the two — when a monthly
  programme starts being owed.

Both are deliberate and both are documented where they are defined. If
ownership or projected dates end up introducing a third notion of "when this
starts", it should reuse one of these rather than invent one.
