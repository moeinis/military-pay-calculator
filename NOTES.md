# Maintainer Notes

Internal reference for updating and maintaining the Military Take-Home Pay Estimator. Not needed by end users.

## File structure

| File | Purpose |
| --- | --- |
| `index.html` | The entire app — UI, styling, and calculation logic in one file. |
| `bah-data.js` | 2026 BAH rate tables (338 housing areas). Loaded by `index.html` via `<script src>`. Must sit in the same folder. |
| `zip-data.js` | ZIP-to-housing-area map, packed. Also loaded via `<script src>` from the same folder. |
| `build-zip-data.js` | Regenerates `zip-data.js` from the DoD `sorted_zipmha` file. |
| `test.js` | Dependency-free calculation-engine test suite (198 checks). |
| `test-dom.js` | Browser-DOM integration test suite (62 checks). |
| `package.json` / `package-lock.json` | Reproducible Node.js test scripts and pinned development dependencies. |
| `.github/workflows/test.yml` | Runs all 260 automated checks on pushes and pull requests. |
| `README.md` | Public overview. |
| `LICENSE` | MIT. |
| `NOTES.md` | This file. |

Both `index.html` and `bah-data.js` must be deployed together or BAH auto-fill breaks. Degraded mode is handled explicitly: if `bah-data.js` is missing or blocked, the station dropdowns are disabled and relabeled "BAH data unavailable — enter BAH manually," and every other calculation still works from a manually entered BAH.

## Data sources (all 2026)

- **Basic pay** — DFAS / FY2026 NDAA (3.8% raise, effective 1 Jan 2026). Hardcoded in the `PAY` object in `index.html`.
- **BAS** — DFAS: $476.95 enlisted / $328.48 officer (`BAS_ENL` / `BAS_OFF`).
- **BAH** — DoD DTMO `BAH-ASCII-2026` files, parsed into `bah-data.js`.
- **Federal brackets & standard deduction** — IRS Rev. Proc. 2025-32 (`BRACKETS`, `STD_DED`).
- **FICA** — Social Security wage base $184,500 (`SS_WAGE_BASE`); Additional Medicare 0.9% over $200,000.
- **State income tax** — 2026 brackets & standard deductions (Tax Foundation) in the `STATES` object. Active-duty treatment per MyAirForceBenefits "Which states tax my active-duty pay." Each state is one of: `none` (no income tax), `exemptDefault` (fully exempts active-duty pay — box pre-checked), `cond` (taxed if stationed in-state, exempt if stationed elsewhere — taxed by default, note prompts the user to check the exempt box), or plain taxed. Fully-exempt set: AZ, AR, IL, IN, IA, KY, MI, MN, MO, MT, NM, ND, OK. Conditional set: CA, CT, ID, ME, NY, OH, OR, PA, VT. States that only exempt combat/National Guard pay (e.g., AL, KS, LA, NE, NJ, WV, WI) are treated as taxed. State-specific mechanisms the engine models: `fedDeduct` (Alabama deducts federal income tax paid — `stateTaxAnnual` receives the member's annual federal tax), and `credit` / `creditPhase` (taxpayer credits subtracted after tax, e.g., Utah's phasing-out credit and Oregon's exemption credit). Graduated brackets are used for CT, DC, KS, NE, NJ, WI (previously flat approximations).
- **Executive Schedule pay caps** — Level II $18,808.20 (O-7–O-10), Level V $15,258.30 (O-6) (`PAY_CAP`).

## Updating for a new year (e.g., 2027)

1. **BAH:** download `BAH-ASCII-2027.zip` from travel.dod.mil (Allowances → BAH → BAH Data Collection). Unzip. Regenerate `bah-data.js` from `bahw27.txt`, `bahwo27.txt`, `mhanames27.txt`. Column order is fixed: `E1..E9, W1..W5, O1E, O2E, O3E, O1..O10` (27 columns). The `BAH_COL` map in `index.html` encodes this.
   **Also regenerate the ZIP map from the same bundle** — it changes yearly too:
   ```
   node build-zip-data.js sorted_zipmha27.txt
   ```
   The script prints a round-trip check; `round-trip errors` and `phantom lookups` must both be 0 before committing.
2. **Basic pay:** replace the `PAY` object with the new year's monthly table.
3. **BAS:** update `BAS_ENL` / `BAS_OFF`.
4. **Federal:** update `BRACKETS`, `STD_DED`, and `SS_WAGE_BASE`.
5. **Pay caps:** update `PAY_CAP` (Executive Schedule Levels II and V).
6. **State tax:** spot-check the `STATES` object for rate/bracket changes (several states adjust rates annually).
7. Update the year labels in the header, badge, and disclaimer text.

## Calculation model (assumptions)

- Federal income tax is estimated as **annual liability ÷ 12** using the standard deduction — an estimate of paycheck impact, not exact W-4 withholding.
- Taxes are computed on the **service member's own pay only** (basic pay + taxable special pays, less Traditional TSP). Spouse/household income is deliberately not modeled — it would lower the member's own paycheck take-home, which is confusing for a paycheck tool.
- **Allowances (BAH, BAS) and FSA are non-taxable.** All other special pays are taxable.
- **Combat zone:** enlisted and warrant officers fully excluded from federal income tax; commissioned officers capped at max enlisted pay + IDP (`CZTE_CAP`). FICA still applies.
- **TSP:** Traditional reduces federal and state taxable income (not FICA); Roth does not reduce taxable income but is still deducted from take-home.
- **State standard deductions** are applied to military income alone (accurate for a single-income household). Head-of-household uses single-filer figures as an approximation.

## External validation (DoD/CRS benchmark)

Checked against independent published figures: CRS *Defense Primer: Regular
Military Compensation* (IF10532, Table 1), citing DOD **Selected Military
Compensation Tables, January 1, 2026**.

- **BAS matches exactly** — $5,723/yr enlisted, $3,942/yr officer.
- **Basic pay** — every DoD grade average falls inside our table's range.
  This benchmark is what surfaced the missing **E-1 under-4-months rate**
  ($2,226 vs $2,407); it is now a separate selectable grade.
- **BAH** — our unweighted mean across 338 areas differs from DoD's averages by
  −1.6% (E-5) to −11.5% (O-6). Expected: DoD weights by troop population, which
  concentrates in high-cost areas. Per-area values are verified exact against DTMO.
- **Federal tax advantage** — ours runs ~12–16% below the DoD figure for most
  grades. Expected and not a defect: the DoD number includes the **Earned Income
  Tax Credit** and an averaged household composition, while this tool models the
  individual's own filing status with no credits. (DoD's own figures are
  non-monotonic — E-8 advantage sits below E-5 — which only makes sense with
  varying dependent/credit assumptions.)

## BAH lookup: duty station or ZIP

Each scenario offers a **Duty station / ZIP code** toggle. Both fill the same
BAH field; the member picks whichever they know.

ZIP exists because members frequently live away from their duty station — Guard
and Reserve on Title 10 or ADOS orders that can run two years, Navy families who
geo-bach through a homeport shift. Previously the page sent those people to the
external DoD BAH lookup, which loses them.

- `zip-data.js` packs the official DTMO mapping: 40,959 ZIPs collapsed into
  23,844 ranges over 339 areas, base-36 encoded, ~135 KB instead of 533 KB.
  `zipToMha()` binary-searches the ranges.
- **Ranges never span a gap in ZIP numbering.** An unassigned ZIP returns null
  and the UI says so, rather than inheriting a neighbour's rate.
- A failed lookup (unknown ZIP, or an overseas ZIP that uses OHA) **zeroes the
  BAH field**. Leaving the previous location's rate there looks plausible and
  would silently price the wrong place.
- The chosen mode round-trips in shared links via the hidden `modeA`/`modeB`
  fields, and `__restoreLookupModes()` runs *after* `applyState()`. Without that,
  a ZIP link reopened on the station tab; for a cost-group area — which has no
  dropdown entry — the station came back blank and a later grade change left the
  old rate in place.

**County cost groups are deliberately absent from the dropdown.** The 39
`COUNTY COST GROUP nnn` areas are DFAS bookkeeping for rural counties outside any
named metro area; no member knows their cost group. They remain reachable by ZIP,
and a test asserts all 39 still resolve. Real county *names* (Honolulu County,
Maui County) are kept — those are places people recognise.

## Scope decision: special pays are "what I'm getting now"

Settled with the reviewer, Sep 2026. There are 60+ special and incentive pay
categories across the services, and two ways to present them:

1. **What am I getting now** — the member ticks what applies and types the
   amount. This is what is built.
2. **What could I earn** — every category from FMR Volume 7A, amounts derived
   from grade and branch.

Option 1, deliberately. The tool answers "how far does my pay go in a different
place," and the member has the real figures on their LES. Option 2 is a
recruiting and career-planning tool — a reasonable thing to build one day, but a
different product, and the reviewer's view was that it is "farther down the line
and a much bigger build."

The **Other special pay** row is what makes this work: anything not listed gets
entered there, so no one is blocked by a missing category. Do not replace that
with a long taxonomy without revisiting the decision above.

The listed defaults are common 2026 maximums, which is a nudge toward option 2.
They are only applied when a row is ticked, and the section says the surest
figures are the ones on the LES — keep that wording if the defaults stay.

## Constants the tests cannot actually vouch for

A reviewer with a real LES found that `PAY_CAP` held 2025 Executive Schedule
figures while the pay table already held 2026 rates, so the stale ceiling was
clipping correct pay — about $150/month for a senior O-6, $191 for an O-9.

**Every automated check passed the whole time.** The test asserted the same
literal the app used, so it only proved the constant had not been edited by
accident. Self-consistent, and wrong. Worth being precise about which constants
are genuinely anchored and which are not:

| Constant | How it is checked | Goes stale silently? |
| --- | --- | --- |
| BAS | vs DoD annual figures via CRS IF10532 | No — external anchor |
| BAH | 18,252 cells vs DTMO source files | No — external anchor |
| Basic pay | DoD grade averages must fall in range | Partly — a whole-table shift could pass |
| SGLI | recomputed from rate x cover + TSGLI | No — formula, not literals |
| `PAY_CAP` | derived from the OPM annual rate / 12 | Only if the OPM annual figure is stale |
| `CZTE_CAP` | derived from the pay table + IDP | No — tracks the table |
| `SS_WAGE_BASE` | literal, **cited + hand-verified vs SSA** | Yes — recheck each January |
| `STD_DED` | literal, **cited + hand-verified vs Rev. Proc. 2025-32** | Yes — recheck each January |
| `BRACKETS` | all 21 floors + rates asserted vs Rev. Proc. 2025-32 | Yes — recheck each January |
| `ADDL_MEDI_THRESHOLD` | one table, statutory (IRC 3101(b)(2)) | No — not inflation-indexed |
| `MEDI_RATE` / `SS_RATE` | asserted against own literal | Yes, but statutory and rarely change |

These change every January and nothing in the suite can tell you the year
turned. **At the yearly update, re-read the IRS Revenue Procedure and the SSA
fact sheet and retype these by hand** — passing tests are not evidence they are
current, only that nobody fat-fingered them since.

### Audit of 2026-09, after the `PAY_CAP` miss

All four flagged constants were re-read against primary sources:

- `SS_WAGE_BASE` $184,500 — correct (SSA).
- `STD_DED` 16,100 / 32,200 / 24,150 — correct (Rev. Proc. 2025-32 §3.19).
- `BRACKETS` — **one error found.** The head-of-household 32% floor was 201,775,
  copied from the single column; the published HoH figure is **201,750**. Fixed.
  Single/MFJ were correct. A HoH filer above ~$201,775 taxable was undertaxed by
  $2/year — trivially small, and exactly the kind of thing that never surfaces
  from a reconciliation complaint, only from reading the source.
- The Additional Medicare threshold was a bare literal duplicated at the call
  site; it is now one table referenced from both places.

The HoH row is a trap for anyone tidying this file: its 32% and 35% floors sit
$25 below single's, which reads like a typo and is not. Two tests assert the
gaps deliberately so a future "cleanup" fails loudly.

The general rule this earned: a constant that can be derived should be derived,
and a constant that cannot should be checked against something outside this
repository. Asserting a literal against itself buys nothing.

## Known limitations (intentional)

- BAH covers CONUS, Alaska, and Hawaii only. OCONUS/overseas uses OHA (not modeled) — the manual BAH field covers those.
- State tax credits (CTC, EITC), itemized deductions, and local income taxes outside Maryland are not modeled.
- The `XX499 = "UNKNOWN, NA"` placeholder area in the DTMO data is filtered out of the station dropdown.

## Robustness & security (production hardening)

- **Input clamping** — `num(id,min,max)` coerces every numeric field; non-numeric/empty → 0, negatives clamp to 0, TSP capped at 100%. Prevents negative "other deductions" from inflating take-home.
- **Tamper guards** — unknown `filing` falls back to `single`; `yos` is clamped to the valid index range; unknown grade yields 0 base pay instead of throwing. A malformed or hostile share link cannot crash the page.
- **XSS** — user-supplied station labels are shareable via URL and rendered through `innerHTML`, so all label and state text passes through `esc()` (escapes `& < > " '`). Never render user input without `esc()`.
- **Negative BAH / NaN** clamps to 0.
- **`esc()` is defined at the top of the script** because it is called during initial render of the special-pay rows. Do not move it below its first use.

## Feedback form

**Currently live: the Google Form path.** The button under the results is a link
to the form; the in-page fields described below are hidden because they have no
endpoint to submit to.

The Google Form asks, in this order: Rank · Years of service · Duty station ·
State (all optional) · *Was this accurate or inaccurate…* · *How can we improve
it…* · Name · Email (those four required).

**The first four arrive pre-filled.** `feedbackUrl()` appends them as prefill
parameters using the ids in `FEEDBACK_PREFILL`, so the reporter only answers the
two questions that need a human.

> ⚠️ **If you edit the Google Form, re-check those ids.** Adding, deleting or
> retitling a question can change them, and a stale id fails silently — the
> field simply arrives blank, with nothing in the UI to indicate it.
> To read the current ids: open the live form and evaluate
> `FB_PUBLIC_LOAD_DATA_[1][1]` in the console. Each question is `[id, title, …]`
> with the entry id at `[4][0][0]`. Set any entry in `FEEDBACK_PREFILL` to `""`
> to stop sending that field.

The context line under the button shows exactly what is being sent, so the
member can see it before it leaves the page.

**Known limit:** prefill describes **Scenario A only**. Someone comparing two
stations who finds a fault in Scenario B will send Scenario A's location. The
free-text answers are where that gets clarified.

**Where the answers go.** Set exactly one of two constants near the top of the
`<script>` in `index.html`:

```js
const FEEDBACK_FORM_URL = "https://forms.gle/XXXXXXXX";  // Google Form: button opens it
const FEEDBACK_ENDPOINT = "";                            // or a JSON POST URL
```

- `FEEDBACK_ENDPOINT` wins if both are set. It receives a JSON POST with every
  field above plus the auto-filled context; use Formspree, Zapier, or an Apps
  Script web app.
- If only `FEEDBACK_FORM_URL` is set, the in-page fields are hidden and the
  button opens the Google Form instead — the fields cannot submit anywhere
  without an endpoint, so showing them would be a dead end.
- If both are empty the card falls back to the public GitHub issue link, so the
  button is never dead.

**Name and email must not be routed to GitHub issues.** Those are public, and
these responses pair a person's identity with details about their own pay. Keep
the Google Form's response sheet private, and leave the form's own "Collect
email addresses" setting off — question 3 asks for it explicitly, with context.

## Accessibility & print

- Results and the comparison delta use `aria-live="polite"` so screen readers announce recalculated values.
- Every static control has a `<label for>`; the 12 generated special-pay amount inputs carry `aria-label`.
- Print stylesheet: hides action buttons, forces exact brand color, prevents cards from splitting across pages, and appends link URLs after anchors.

## Running the tests

```
npm ci                # install the exact locked test dependency
npm test              # 198 engine + 62 DOM integration checks
```

`test-dom.js` parses the real `index.html` in a real DOM, executes the real
scripts, and drives the UI with dispatched events — catching anything a stubbed
DOM could hide (options never created, listeners never wired, escaping that only
looks safe as a string). If jsdom isn't installed, it exits 2 and fails the test
command with instructions to install the locked dependencies using `npm ci`.

**Not covered by either suite: visual layout.** jsdom has no renderer, so how the
page *looks* — especially on a phone — still needs a human with a browser.

The suites contain 260 checks covering the golden case, 2026 constants, the pay
table, BAH data integrity and lookup, FICA/combat-zone/TSP behaviour, all 51
state jurisdictions, special pays, input hardening, a 1,071-combination sweep,
XSS escaping, share-link round-trip, corrupted-data resilience, accessibility,
deployment metadata, and real DOM event integration. Exit code 0 = pass. **Run
them after any change to `index.html` or `bah-data.js`, and after the yearly rate
update.**

## Verification

The calculation logic has an automated test harness approach: load `bah-data.js` + the inline script into Node with a stubbed DOM, then assert invariants (pay caps, BAH lookup vs raw data for all areas, combat/TSP/FICA behavior, all-state validity, effective-rate bounds). Re-run after any data or logic change.
