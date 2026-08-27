# Military Take-Home Pay Estimator (2026)

*A Blue Star Families tool.*

A single-file, dependency-free web app that estimates a U.S. service member's monthly **gross** and **take-home** pay — basic pay, allowances, special pays, and estimated federal, FICA, and state taxes — and lets you **compare two duty stations** side-by-side to see how a move (PCS) changes the paycheck.

**▶ Live tool: https://blue-star-families1.github.io/military-pay-calculator/**

## Why

Military pay has many moving parts that change with rank, location, duty type, and state of residence. Most online calculators show gross pay only. This tool models the **deductions** too, so families can estimate real take-home when weighing housing and relocation decisions.

## Features

- **2026 basic pay** for all grades (E-1–E-9, W-1–W-5, O-1–O-10, plus O-1E/2E/3E) by years of service (FY2026 NDAA, 3.8% raise).
- **BAS** auto-added ($476.95 enlisted / $328.48 officer); **BAH** auto-fills from official 2026 DoD DTMO rates (338 housing areas) by duty station, grade, and dependents — override anytime.
- **Special & incentive pays**: sea pay, aviation/ACIP, hostile fire/IDP, hazardous duty, jump, HALO, dive, submarine, hardship, SDAP, and Family Separation Allowance (non-taxable).
- **Deductions modeled**: federal income tax (2026 brackets + standard deduction), Social Security (6.2% to the $184,500 wage base), Medicare (1.45%), state income tax (real 2026 brackets & standard deductions for all 50 states + DC), TSP (traditional vs Roth), SGLI, combat-zone exclusion, and other allotments.
- **Duty-station comparison** with monthly and annual take-home difference, effective tax rate, and take-home percentage.
- Runs entirely in the browser. No server, no data leaves the page.

## Files

- `index.html` — the app (must be at the repo root)
- `bah-data.js` — 2026 BAH rate tables loaded by the app (must sit next to `index.html`)
- `test.js`, `test-dom.js` — 237 automated engine and DOM integration checks
- `package.json`, `package-lock.json` — reproducible test command and locked test dependency
- `NOTES.md` — maintainer guide: data sources, yearly update steps, model assumptions
- `social-preview.png` — link-sharing preview card
- `README.md`, `LICENSE`

`index.html` and `bah-data.js` must be deployed together. If `bah-data.js` is missing, the app still works — the duty-station dropdown disables itself and BAH becomes a manual field.

## Usage

Open `index.html` in any browser (with `bah-data.js` in the same folder), or visit the live demo. Everything recalculates as you type.

## Data sources (2026)

- Basic pay — DFAS / FY2026 NDAA
- BAS — DFAS
- Federal brackets & standard deduction — IRS Rev. Proc. 2025-32 (via Tax Foundation)
- FICA — Social Security wage base $184,500
- State income tax — 2026 brackets & standard deductions (Tax Foundation)
- BAH — official DoD DTMO 2026 rate tables (338 military housing areas, all pay grades, with/without dependents)

## Disclaimer

**Scope.** Built for active-duty pay, including National Guard and Reserve members mobilized on Title 10 orders (30+ days), who are paid on the same tables with the same allowances. It is **not** built for weekend drill (IDT) or annual training pay — those are earned per drill period rather than monthly, use a different housing allowance (BAH-RC/T), and several states tax Guard pay differently from active-duty pay.

**Estimate only.** Federal income tax is estimated as annual liability ÷ 12, not exact W-4 withholding. Taxes are computed on the service member's own pay; spouse/household income is not modeled. State tax credits, itemized deductions, per-child credits, and local taxes outside Maryland are not modeled. OCONUS locations use OHA rather than BAH and are not in the station list (enter BAH manually). Verify with your finance office / MyPay before making financial decisions. Not affiliated with, or endorsed by, the U.S. Department of Defense or DFAS.

## License

MIT — see [LICENSE](LICENSE).
