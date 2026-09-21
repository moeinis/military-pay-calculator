#!/usr/bin/env node
/*
 * Regression suite for the Military Take-Home Pay Estimator.
 *
 *   node test.js
 *
 * No dependencies. Loads bah-data.js + the inline script from index.html into a
 * stubbed DOM, then asserts behaviour. Run this after ANY change to index.html
 * or bah-data.js — especially the yearly rate update (see NOTES.md).
 *
 * Exit code 0 = all passed, 1 = failures.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const bahSrc = fs.readFileSync(path.join(DIR, 'bah-data.js'), 'utf8');

// ---------------------------------------------------------------- harness ---
const IDS = ['grade','yos','filing','tsp','tsptype','sgli','other','deps','combat',
  'bahA','bahB','stateA','stateB','labelA','labelB','compareOn','stationA','stationB',
  'exemptA','exemptB','stateNoteA','stateNoteB','results','diffBox','specials',
  'sources','printBtn','shareBtn','scnB','srStatus'];
const SPKEYS = ['seapay','flight','hfp','hdip','jump','halo','dive','sub','hardship',
  'sdap','fsa','custom'];
const CHECKBOXES = ['combat','compareOn','exemptA','exemptB'];

function appScript() {
  const start = html.indexOf('<script>', html.indexOf('bah-data.js')) + 8;
  return html.slice(start, html.lastIndexOf('</script>'));
}

/** Boot the app in a stubbed DOM. dataSrc defaults to the real bah-data.js. */
function boot(opts) {
  opts = opts || {};
  const dataSrc = opts.dataSrc !== undefined ? opts.dataSrc : bahSrc;
  const store = {}, writes = {}, opted = {}, handlers = {};
  let replaceThrew = false;

  function mk(id) {
    if (!store[id]) store[id] = {
      id, value: '', checked: false, disabled: false,
      type: (id.startsWith('sp_') || CHECKBOXES.includes(id)) ? 'checkbox' : 'text',
      options: [{ textContent: '— choose to auto-fill BAH —' }],
      style: {}, classList: { toggle() {} },
      addEventListener(ev, cb) { (handlers[id] = handlers[id] || []).push(cb); },
      appendChild(o) { (opted[id] = opted[id] || []).push(o.value); },
      setAttribute() {}, select() {}, setSelectionRange() {},
      set innerHTML(v) { writes[id] = v; }, get innerHTML() { return writes[id] || ''; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t || ''; }
    };
    return store[id];
  }

  global.location = opts.location ||
    { search: opts.query || '', protocol: 'https:', origin: 'https://x.io',
      pathname: '/p/', href: 'https://x.io/p/' };
  global.history = { replaceState() { if (opts.replaceThrows) { replaceThrew = true; throw new Error('SecurityError'); } } };
  // Node >= 21 exposes a getter-only global `navigator`; redefine it.
  Object.defineProperty(global, 'navigator',
    { value: opts.navigator || {}, configurable: true, writable: true });
  global.window = { isSecureContext: opts.secure !== false };
  global.setTimeout = (fn) => { try { fn(); } catch (e) {} return 1; };
  global.clearTimeout = () => {};
  const everything = () => {
    const l = IDS.map(mk);
    SPKEYS.forEach(k => { l.push(mk('sp_' + k)); l.push(mk('spamt_' + k)); });
    return l;
  };
  global.document = {
    getElementById: mk,
    createElement: () => ({ style: {}, value: '', setAttribute() {}, select() {},
      setSelectionRange() {}, set innerHTML(v) {}, appendChild() {} }),
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => opts.execOk !== false,
    querySelectorAll: () => ({ forEach: f => everything().forEach(f) })
  };

  IDS.forEach(mk);
  SPKEYS.forEach(k => { mk('sp_' + k); mk('spamt_' + k).value = '0'; });
  // sensible defaults matching the HTML
  const d = { grade: 'E-5', yos: '4', filing: 'single', tsp: '5', tsptype: 'trad',
    sgli: '31', other: '0', deps: 'yes', bahA: '1800', bahB: '3300',
    stateA: 'NC', stateB: 'CA' };
  Object.keys(d).forEach(k => { mk(k).value = d[k]; });
  mk('compareOn').checked = true;

  let error = null, api = null;
  // Data globals may not exist at all when testing a missing/blank data file,
  // so export them defensively.
  const exports_ = '\n;return {calculate,calcScenario,basicPay,bahLookup,num,esc,' +
    'collectState,applyState,stateNote,stateTaxAnnual,fedTaxOnAnnual,money,money2,BAH_MAX,' +
    'STATES,SPECIALS,PAY,BRACKETS,STD_DED,BAH_COL,' +
    'PAY_CAP,CZTE_CAP,BAS_ENL,BAS_OFF,SS_WAGE_BASE,YOS_LABELS,' +
    'ADDL_MEDI_THRESHOLD,ADDL_MEDI_RATE,' +
    'BAH_W:(typeof BAH_W!=="undefined"?BAH_W:null),' +
    'BAH_WO:(typeof BAH_WO!=="undefined"?BAH_WO:null),' +
    'MHA_NAMES:(typeof MHA_NAMES!=="undefined"?MHA_NAMES:null)};';
  try { api = new Function(dataSrc + '\n' + appScript() + exports_)(); }
  catch (e) { error = e.message; }

  return { api, error, el: mk, store, writes, opted, handlers,
    fire: id => (handlers[id] || []).forEach(cb => cb()),
    replaceThrew: () => replaceThrew };
}

// ------------------------------------------------------------- assertions ---
let passed = 0, failed = 0, group = '';
const G = g => { group = g; console.log('\n' + g); };
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.log('  FAIL  ' + name); }
}
function eq(name, got, want, tol) {
  tol = tol === undefined ? 0.6 : tol;
  const good = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (good) { passed++; }
  else { failed++; console.log('  FAIL  ' + name + '  got ' + got + '  want ' + want); }
}

// ------------------------------------------------------------------ tests ---
const app = boot();
if (app.error) { console.error('FATAL: app failed to boot -> ' + app.error); process.exit(1); }
const A = app.api;
const { calcScenario, basicPay, bahLookup, STATES, SPECIALS, BAH_W, BAH_WO,
        BAH_COL, MHA_NAMES, PAY, BRACKETS, STD_DED, PAY_CAP, CZTE_CAP,
        BAS_ENL, BAS_OFF, SS_WAGE_BASE, YOS_LABELS,
        ADDL_MEDI_THRESHOLD, ADDL_MEDI_RATE } = A;

const set = (id, v) => { app.el(id).value = String(v); };
const chk = (id, b) => { app.el(id).checked = b; };
function baseline() {
  set('grade','E-5'); set('yos','4'); set('filing','single');
  set('tsp','5'); set('tspRoth','0');        // traditional / roth are separate now
  set('sgli','26'); set('other','0'); set('deps','yes');   // $500k at the 2025 VA rate
  chk('combat', false);
  SPECIALS.forEach(s => { chk('sp_' + s[0], false); set('spamt_' + s[0], '0'); });
}
const exemptDefault = c => !!(STATES[c].none || STATES[c].exemptDefault);

G('Golden case (E-5, 6yr, single, NC, BAH 1800, 5% traditional TSP, SGLI $26)');
baseline();
let r = calcScenario(1800, 'NC', false);
eq('gross', r.gross, 6386.95);
eq('federal tax', r.fedTax, 286.87);
eq('social security', r.ss, 254.82);
eq('medicare', r.medi, 59.60);
eq('NC state tax', r.stateTax, 113.40);
eq('TSP', r.tspAmt, 205.50);
eq('take-home', r.takeHome, 5440.76, 1);   // +$5.00: SGLI corrected from $31 to $26
ok('take-home identity', Math.abs(r.takeHome -
  (r.gross - (r.fedTax + r.ss + r.medi + r.stateTax + r.tspAmt + r.sgli + r.other))) < 0.01);
ok('effective-rate identity', Math.abs(r.effRate -
  (r.fedTax + r.ss + r.medi + r.stateTax) / r.gross) < 1e-9);

G('2026 constants');
eq('BAS enlisted', BAS_ENL, 476.95, 0);
eq('BAS officer', BAS_OFF, 328.48, 0);
eq('SS wage base', SS_WAGE_BASE, 184500, 0);
eq('standard deduction single', STD_DED.single, 16100, 0);
eq('standard deduction MFJ', STD_DED.mfj, 32200, 0);
eq('standard deduction HoH', STD_DED.hoh, 24150, 0);
// OPM Salary Table 2026-EX: Level II $228,000, Level V $184,900, monthly = /12.
// These were 2025 figures ($225,700 / $183,100) and were clipping correct 2026
// pay — an O-6 past 30 years lost about $150 a month to a stale ceiling.
eq('Exec Schedule Level II cap', PAY_CAP['O-10'], 228000 / 12, 0.01);
eq('Exec Schedule Level V cap', PAY_CAP['O-6'], 184900 / 12, 0.01);
ok('Level II cap is above the 2025 figure', PAY_CAP['O-10'] > 18808.20);
ok('Level V cap is above the 2025 figure', PAY_CAP['O-6'] > 15258.30);
// Derived, not transcribed: highest enlisted basic pay + $225 IDP.
(() => {
  const maxEnlisted = Math.max(...Object.keys(PAY)
    .filter(g => g.startsWith('E-'))
    .flatMap(g => PAY[g].filter(v => v != null)));
  eq('CZTE officer cap', CZTE_CAP, maxEnlisted + 225, 0.01);
  ok('CZTE cap tracks the pay table, not a written-down number',
     CZTE_CAP > maxEnlisted);
})();
ok('7 federal brackets per status',
  ['single','mfj','hoh'].every(f => BRACKETS[f].length === 7));
ok('brackets strictly increasing', Object.values(BRACKETS).every(br => {
  for (let i = 1; i < br.length; i++) if (br[i][0] <= br[i-1][0] || br[i][1] <= br[i-1][1]) return false;
  return true;
}));
/* Bracket floors transcribed from IRS Rev. Proc. 2025-32 sec. 3.01, Tables 1-3
   (tax year 2026). Checked here rather than left to "looks plausible": the HoH
   row had 201775 copied across from single, where the published figure is
   201750. A shape check cannot see that; only the source can. */
(() => {
  const IRS_2026 = {
    single: [0, 12400,  50400, 105700, 201775, 256225, 640600],
    mfj:    [0, 24800, 100800, 211400, 403550, 512450, 768700],
    hoh:    [0, 17700,  67450, 105700, 201750, 256200, 640600]
  };
  const RATES = [.10, .12, .22, .24, .32, .35, .37];
  Object.keys(IRS_2026).forEach(f => {
    IRS_2026[f].forEach((floor, i) => {
      eq(`${f} bracket ${i} floor (Rev. Proc. 2025-32)`, BRACKETS[f][i][0], floor, 0);
      eq(`${f} bracket ${i} rate`, BRACKETS[f][i][1], RATES[i], 1e-12);
    });
  });
  // The two figures most likely to be "corrected" into a bug by a future editor.
  ok('HoH 32% floor is NOT single\'s 32% floor',
     BRACKETS.hoh[4][0] === 201750 && BRACKETS.single[4][0] === 201775);
  ok('HoH 35% floor is NOT single\'s 35% floor',
     BRACKETS.hoh[5][0] === 256200 && BRACKETS.single[5][0] === 256225);
})();
// Additional Medicare Tax thresholds are statutory (IRC 3101(b)(2)), not indexed.
eq('Addl Medicare threshold single', ADDL_MEDI_THRESHOLD.single, 200000, 0);
eq('Addl Medicare threshold HoH',    ADDL_MEDI_THRESHOLD.hoh,    200000, 0);
eq('Addl Medicare threshold MFJ',    ADDL_MEDI_THRESHOLD.mfj,    250000, 0);
eq('Addl Medicare rate',             ADDL_MEDI_RATE,             0.009,  1e-12);

G('Basic pay table');
eq('E-1 <2yr', basicPay('E-1', 0), 2407, 0);
eq('E-5 6yr', basicPay('E-5', 4), 4110, 0);
eq('O-3 6yr', basicPay('O-3', 4), 7737, 0);
eq('E-8 below minimum YOS falls back', basicPay('E-8', 0), 5657, 0);
eq('W-5 below minimum YOS falls back', basicPay('W-5', 0), 10170, 0);
// At the 2026 ceiling the published O-9/O-10 rate sits just under Level II, so
// the cap no longer binds for them — it still binds for a senior O-6.
eq('O-10 pays the published rate', basicPay('O-10', 10), PAY['O-10'][10], 0.01);
ok('O-10 is at or under the Level II ceiling', basicPay('O-10', 10) <= PAY_CAP['O-10'] + 0.01);
eq('O-6 capped at high YOS', basicPay('O-6', 17), 184900 / 12, 0.01);
ok('the O-6 cap actually binds', PAY['O-6'][17] > PAY_CAP['O-6']);
eq('O-6 uncapped at low YOS', basicPay('O-6', 0), 8751, 0);
(() => {
  const expected = ['E-1 <4mo','E-1','E-2','E-3','E-4','E-5','E-6','E-7','E-8','E-9',
    'W-1','W-2','W-3','W-4','W-5','O-1','O-2','O-3','O-4','O-5','O-6','O-7','O-8','O-9','O-10',
    'O-1E','O-2E','O-3E'];
  const have = Object.keys(PAY);
  ok('every expected pay grade present', expected.every(g => have.includes(g)));
  ok('no unexpected pay grades', have.every(g => expected.includes(g)));
  ok('every pay grade has a BAH column', have.every(g => BAH_COL[g] != null));
  ok('every pay grade is selectable', expected.every(g => A.YOS_LABELS && PAY[g]));
})();
ok('all rows have 18 YOS columns', Object.values(PAY).every(a => a.length === 18));
ok('YOS labels match columns', YOS_LABELS.length === 18);
(() => {
  let zero = 0, backwards = 0;
  Object.keys(PAY).forEach(g => {
    let prev = 0;
    for (let i = 0; i < 18; i++) { const p = basicPay(g, i);
      if (!(p > 0)) zero++; if (p < prev - 0.001) backwards++; prev = p; }
  });
  ok('no zero/negative pay cells', zero === 0);
  ok('pay never decreases with service', backwards === 0);
})();

G('External benchmark: DoD "Selected Military Compensation Tables" via CRS IF10532 (Jan 1 2026)');
// Independent published figures. Annual. Source: CRS Defense Primer: Regular
// Military Compensation, Table 1, citing DOD Selected Military Compensation
// Tables, January 1, 2026, "Detailed RMC Tables for All Personnel," p. B-3.
(() => {
  const CRS = {
    'E-1': { basic: 27965, bas: 5723 }, 'E-5': { basic: 49965, bas: 5723 },
    'E-8': { basic: 83807, bas: 5723 }, 'O-1': { basic: 51289, bas: 3942 },
    'O-4': { basic: 118273, bas: 3942 }, 'O-6': { basic: 174534, bas: 3942 }
  };
  eq('enlisted BAS matches DoD annual figure', BAS_ENL * 12, 5723, 1);
  eq('officer BAS matches DoD annual figure', BAS_OFF * 12, 3942, 1);
  // DoD grade averages must sit inside the min..max of that grade's pay row.
  // (E-1 average blends the under-4-months and over-4-months rates.)
  Object.keys(CRS).forEach(g => {
    const cells = PAY[g].filter(v => v != null);
    const lo = Math.min(...cells), hi = Math.max(...cells);
    const perMonth = CRS[g].basic / 12;
    const inRange = g === 'E-1'
      ? perMonth >= basicPay('E-1 <4mo', 0) - 1 && perMonth <= hi + 1
      : perMonth >= lo - 1 && perMonth <= hi + 1;
    ok('DoD ' + g + ' average pay is within our table range', inRange);
  });
  // The under-4-months E-1 rate is what makes the DoD E-1 average reachable.
  eq('E-1 under 4 months rate', basicPay('E-1 <4mo', 0), 2226, 0);
  ok('E-1 under 4 months is lower than standard E-1',
     basicPay('E-1 <4mo', 0) < basicPay('E-1', 0));
  ok('DoD E-1 average falls between the two E-1 rates',
     27965 / 12 > basicPay('E-1 <4mo', 0) && 27965 / 12 < basicPay('E-1', 0));
})();

G('BAH data integrity and lookup');
ok('MHA names present', Object.keys(MHA_NAMES).length > 300);
ok('with-dependent table present', Object.keys(BAH_W).length > 300);
ok('rate tables same size', Object.keys(BAH_W).length === Object.keys(BAH_WO).length);
ok('every row has 27 grade columns',
  Object.values(BAH_W).every(a => Array.isArray(a) && a.length === 27) &&
  Object.values(BAH_WO).every(a => Array.isArray(a) && a.length === 27));
ok('all rates positive and finite',
  Object.values(BAH_W).every(a => a.every(v => Number.isFinite(v) && v > 0)));
ok('with-dependents >= without-dependents everywhere',
  Object.keys(BAH_W).every(m => !BAH_WO[m] || BAH_W[m].every((v, i) => v >= BAH_WO[m][i])));
(() => {
  let wrong = 0;
  Object.keys(BAH_W).forEach(m => {
    Object.keys(BAH_COL).forEach(g => {
      set('grade', g);
      set('deps', 'yes'); if (bahLookup(m) !== BAH_W[m][BAH_COL[g]]) wrong++;
      set('deps', 'no');  if (bahLookup(m) !== BAH_WO[m][BAH_COL[g]]) wrong++;
    });
  });
  ok('lookup exact for every area x grade x dependent state', wrong === 0);
})();
ok('unknown area returns null', bahLookup('ZZZZZ') === null);
ok('empty area returns null', bahLookup('') === null);
ok('unmapped placeholder excluded from dropdown', !(app.opted['stationA'] || []).includes('XX499'));

G('Taxes: FICA, combat zone, TSP');
baseline(); set('grade','O-10'); set('yos','20'); set('filing','single');
ok('social security capped at wage base',
  calcScenario(3000,'TX',true).ss <= (SS_WAGE_BASE/12)*0.062 + 0.01);
ok('Additional Medicare applies over threshold (single)',
  calcScenario(3000,'TX',true).medi > basicPay('O-10',20)*0.0145 + 0.01);
baseline(); set('grade','O-10'); set('yos','20'); set('filing','mfj');
ok('Additional Medicare not applied below MFJ threshold',
  Math.abs(calcScenario(3000,'TX',true).medi - basicPay('O-10',20)*0.0145) < 0.01);
baseline(); chk('combat', true);
ok('combat zone: enlisted federal tax = 0', calcScenario(1800,'VA',false).fedTax === 0);
ok('combat zone: FICA still charged', calcScenario(1800,'VA',false).ss > 0);
baseline(); set('grade','W-4'); set('yos','12'); chk('combat', true);
ok('combat zone: warrant officer federal tax = 0', calcScenario(1800,'VA',false).fedTax === 0);
(() => {
  baseline(); set('grade','O-8'); set('yos','17'); chk('combat', true);
  const inZone = calcScenario(2000,'VA',false).fedTax;
  baseline(); set('grade','O-8'); set('yos','17');
  const home = calcScenario(2000,'VA',false).fedTax;
  ok('combat zone: senior officer capped, still owes some', inZone > 0);
  ok('combat zone: senior officer pays less than at home', inZone < home);
})();
(() => {
  // Traditional and Roth are separate elections that can run together.
  baseline(); set('tsp','5');  set('tspRoth','0'); const trad = calcScenario(2000,'VA',false);
  baseline(); set('tsp','0');  set('tspRoth','5'); const roth = calcScenario(2000,'VA',false);
  ok('traditional TSP lowers taxable income', trad.fedTax < roth.fedTax);
  ok('both TSP types deduct the same from take-home',
     Math.abs(trad.tspAmt - roth.tspAmt) < 0.01);
  ok('traditional is reported separately', trad.tspTrad > 0 && trad.tspRoth === 0);
  ok('roth is reported separately', roth.tspRoth > 0 && roth.tspTrad === 0);

  // Both at once — the case that was impossible before.
  baseline(); set('tsp','5'); set('tspRoth','5'); const both = calcScenario(2000,'VA',false);
  ok('both can be contributed together', both.tspTrad > 0 && both.tspRoth > 0);
  ok('combined deduction is the sum', Math.abs(both.tspAmt - (trad.tspAmt + roth.tspAmt)) < 0.01);
  // Adding Roth on top does not change tax: the traditional share is identical,
  // and Roth is deducted after tax.
  ok('adding roth does not change tax', Math.abs(both.fedTax - trad.fedTax) < 0.01);
  ok('roth-only is taxed more than traditional-only', roth.fedTax > both.fedTax);

  // Over-election must be scaled, not allowed to exceed basic pay.
  baseline(); set('tsp','80'); set('tspRoth','80'); const over = calcScenario(2000,'VA',false);
  ok('combined contribution cannot exceed basic pay', over.tspAmt <= over.base + 0.01);
  ok('the split is preserved when scaled', Math.abs(over.tspTrad - over.tspRoth) < 0.01);
  baseline();   // leave no state for the next group
})();

G('State tax engine (all 51 jurisdictions)');
(() => {
  const issues = [];
  Object.keys(STATES).forEach(c => {
    const s = STATES[c];
    if (!s.name) issues.push(c + ' has no name');
    if (s.none) { if (s.b || s.flat != null) issues.push(c + ' no-tax state has rates'); return; }
    if (!s.b && s.flat == null) issues.push(c + ' has neither brackets nor a flat rate');
    if (s.b) ['single','mfj'].forEach(f => {
      const br = s.b[f];
      if (!br || !br.length) return issues.push(c + ' missing ' + f + ' brackets');
      if (br[0][0] !== 0) issues.push(c + ' ' + f + ' first threshold is not 0');
      for (let i = 1; i < br.length; i++) {
        if (br[i][0] <= br[i-1][0]) issues.push(c + ' ' + f + ' thresholds not increasing');
        if (br[i][1] < br[i-1][1]) issues.push(c + ' ' + f + ' rates decrease');
      }
      br.forEach(b => { if (b[1] < 0 || b[1] > 0.15) issues.push(c + ' implausible rate ' + b[1]); });
    });
    if (s.flat != null && (s.flat <= 0 || s.flat > 0.15)) issues.push(c + ' implausible flat rate');
  });
  ok('state table structurally sound', issues.length === 0);
  if (issues.length) issues.slice(0, 8).forEach(i => console.log('        - ' + i));
})();
(() => {
  let bad = 0;
  Object.keys(STATES).forEach(c => ['single','mfj'].forEach(f => {
    let prev = -1;
    for (let inc = 0; inc <= 400000; inc += 5000) {
      const t = A.stateTaxAnnual(c, inc, f, 0);
      if (!Number.isFinite(t) || t < 0 || t < prev - 0.01) { bad++; break; }
      prev = t;
    }
  }));
  ok('state tax never decreases as income rises', bad === 0);
})();
ok('zero income -> zero state tax',
  Object.keys(STATES).every(c => A.stateTaxAnnual(c, 0, 'single', 0) === 0));
['AZ','AR','IL','IN','IA','KY','MI','MN','MO','MT','NM','ND','OK'].forEach(c => {
  baseline(); ok('exempt state ' + c + ' -> $0', calcScenario(2000, c, exemptDefault(c)).stateTax === 0);
});
['AK','FL','NV','NH','SD','TN','TX','WA','WY'].forEach(c => {
  baseline(); ok('no-income-tax state ' + c + ' -> $0', calcScenario(2000, c, exemptDefault(c)).stateTax === 0);
});
['AL','KS','LA','NE','NJ','WV','WI','CA','CT','ID','ME','NY','OH','OR','PA','VT','VA','MD','DC'].forEach(c => {
  baseline(); set('grade','O-3'); set('yos','6');
  ok('taxing state ' + c + ' -> > $0', calcScenario(2500, c, false).stateTax > 0);
});
baseline(); ok('exempt checkbox overrides to $0', calcScenario(2500,'CA',true).stateTax === 0);

G('State tax: hand-computed golden values');
// Verified by hand against each state's published 2026 brackets and standard
// deduction, then cross-checked against the state's official published rates.
// Virginia: 2% to $3k, 3% to $5k, 5% to $17k, 5.75% above; SD $8,750 / $17,500;
// identical brackets for every filing status.
(() => {
  const vaSingle = 3000*0.02 + 2000*0.03 + 12000*0.05 + (60000-8750-17000)*0.0575;
  eq('VA single $60,000', A.stateTaxAnnual('VA',60000,'single',0), vaSingle, 0.01);
  const vaJoint = 3000*0.02 + 2000*0.03 + 12000*0.05 + (90000-17500-17000)*0.0575;
  eq('VA married $90,000', A.stateTaxAnnual('VA',90000,'mfj',0), vaJoint, 0.01);
  ok('VA brackets identical across filing statuses',
     JSON.stringify(STATES.VA.b.single) === JSON.stringify(STATES.VA.b.mfj));
  eq('NC single $60,000 (flat 3.99%, SD 12,750)',
     A.stateTaxAnnual('NC',60000,'single',0), (60000-12750)*0.0399, 0.01);
  eq('GA single $60,000 (flat 5.19%, SD 12,000)',
     A.stateTaxAnnual('GA',60000,'single',0), (60000-12000)*0.0519, 0.01);
  // Maryland must exceed a same-rate state because it adds average local tax.
  ok('MD exceeds a comparable state (local tax applied)',
     A.stateTaxAnnual('MD',60000,'single',0) > A.stateTaxAnnual('NC',60000,'single',0));
  // Effective rates must stay in a believable band for real military incomes.
  let implausible = 0;
  Object.keys(STATES).forEach(c => {
    const rate = A.stateTaxAnnual(c, 60000, 'single', 6000) / 60000;
    if (rate < 0 || rate > 0.09) implausible++;
  });
  ok('all state effective rates plausible at $60k', implausible === 0);
})();

G('COLA, with the two kinds taxed differently');
(() => {
  const byKey = Object.fromEntries(SPECIALS.map(s => [s[0], s]));
  ok('CONUS COLA is offered', !!byKey.conuscola);
  ok('overseas COLA is offered', !!byKey.oconuscola);
  ok('CONUS COLA is taxable', byKey.conuscola[3] === true);
  ok('overseas COLA is not taxable', byKey.oconuscola[3] === false);
  ok('both default to zero — the rate varies by location and grade',
     byKey.conuscola[2] === 0 && byKey.oconuscola[2] === 0);

  // The tax treatment has to show up in the actual numbers, not just the flag.
  const amount = 400;
  baseline(); chk('sp_conuscola', true); set('spamt_conuscola', String(amount));
  const conus = calcScenario(1800, 'NC', false);
  baseline(); chk('sp_oconuscola', true); set('spamt_oconuscola', String(amount));
  const oconus = calcScenario(1800, 'NC', false);
  baseline();
  const plain = calcScenario(1800, 'NC', false);

  eq('CONUS COLA raises gross', conus.gross, plain.gross + amount, 0.01);
  eq('overseas COLA raises gross too', oconus.gross, plain.gross + amount, 0.01);
  ok('CONUS COLA is taxed', conus.fedTax > plain.fedTax);
  eq('overseas COLA is not taxed', oconus.fedTax, plain.fedTax, 0.01);
  ok('so the same amount overseas keeps more', oconus.takeHome > conus.takeHome);
  // FICA follows the same taxable/non-taxable split
  ok('CONUS COLA is subject to FICA', conus.ss > plain.ss);
  eq('overseas COLA is not', oconus.ss, plain.ss, 0.01);
  baseline();
})();

G('SGLI premiums follow the published VA formula');
(() => {
  // VA rate from 1 Jul 2025: $0.05 per $1,000 of cover, plus $1.00 TSGLI.
  // Both halves were wrong before: the old $0.06 rate, and a TSGLI add-on that
  // was $1.00 on the top tier and $2.50 on every other one.
  const RATE = 0.05, TSGLI = 1.00;
  const block = html.match(/<select id="sgli">([\s\S]*?)<\/select>/);
  ok('SGLI options are present', !!block);
  const opts = [...block[1].matchAll(/<option value="([\d.]+)">\$?([\d,]+)/g)]
    .map(m => ({ premium: parseFloat(m[1]), cover: parseInt(m[2].replace(/,/g, ''), 10) }));
  ok('all cover tiers listed', opts.length >= 5);
  let wrong = 0;
  opts.forEach(o => {
    if (!o.cover) return;                       // the "Declined" row
    const expect = +(o.cover / 1000 * RATE + TSGLI).toFixed(2);
    if (Math.abs(o.premium - expect) > 0.005) {
      wrong++;
      console.log('        $' + o.cover.toLocaleString() + ' listed at $' +
                  o.premium.toFixed(2) + ', formula gives $' + expect.toFixed(2));
    }
  });
  ok('every premium matches rate x cover + TSGLI', wrong === 0);
  ok('max cover is $26.00', opts.some(o => o.cover === 500000 && Math.abs(o.premium - 26) < 0.005));
  ok('declining SGLI costs nothing', /value="0">\s*Declined/.test(block[1]));
  ok('the rate and its source are stated in the UI',
     /0\.05 per \$1,000/.test(html) && /TSGLI/.test(html));
  ok('tells the member where to find it on the LES', /on your LES/i.test(html));
})();

G('Currency formatting and BAH ceiling');
(() => {
  // Take-home can legitimately go negative when deductions exceed pay; it must
  // read as −$1,234 rather than the malformed $-1,234.
  // note: this suite's eq() compares numbers with a tolerance, so string
  // assertions have to go through ok()
  ok('negative amounts use a leading minus', A.money(-1234) === '−$1,234');
  ok('positive amounts are unchanged', A.money(1234) === '$1,234');
  ok('zero has no sign', A.money(0) === '$0');
  ok('cents formatter signs negatives too', /^−\$/.test(A.money2(-31)));
  // A mistyped BAH must not produce a billion-dollar paycheck.
  ok('BAH ceiling is defined and generous', A.BAH_MAX >= 20000);
  const highest = Math.max(...Object.keys(BAH_W).map(m => Math.max(...BAH_W[m])));
  ok('ceiling sits well above the highest published rate', A.BAH_MAX > highest * 2);
})();

G('Special and incentive pays');
(() => {
  let bad = 0;
  SPECIALS.forEach(s => {
    const key = s[0], taxable = s[3];
    baseline(); const before = calcScenario(1800,'TX',true);
    baseline(); chk('sp_' + key, true); set('spamt_' + key, '500');
    const after = calcScenario(1800,'TX',true);
    if (Math.abs((after.gross - before.gross) - 500) > 0.01) bad++;
    if (taxable && !(after.fedTax > before.fedTax)) bad++;
    if (!taxable && Math.abs(after.fedTax - before.fedTax) > 0.01) bad++;
  });
  ok('all ' + SPECIALS.length + ' special pays behave correctly', bad === 0);
})();
/* Defaults that have been checked against DoD FMR Vol 7A. Only these are
   asserted; the rest are deliberately absent so this block never implies more
   verification than was actually done. Two were wrong when first audited:
   career sea pay was 805, above the statutory ceiling, and submarine duty pay
   was 175, a near-bottom cell. Both values appear in the other pay's table. */
(() => {
  const CITED = {
    seapay: [750, 'FMR 7A Ch 18 para 4.1 — statutory ceiling and Navy table max'],
    hdip:   [150, 'FMR 7A Ch 24 paras 4.3, 5.2, 6.2, 7.3'],
    jump:   [150, 'FMR 7A Ch 24 para 3.3.1 static line'],
    halo:   [225, 'FMR 7A Ch 24 para 3.3.2 military freefall'],
    sub:    [950, 'FMR 7A Ch 23 Table 23-1 — O-5/O-6 over 18, top cell']
  };
  Object.keys(CITED).forEach(key => {
    const row = SPECIALS.find(s => s[0] === key);
    ok('special pay "' + key + '" exists', !!row);
    if (row) eq(key + ' default (' + CITED[key][1] + ')', row[2], CITED[key][0], 0);
  });
  // Career sea pay cannot legally exceed its ceiling, whatever a later edit says.
  ok('career sea pay is at or under the $750 statutory ceiling',
     SPECIALS.find(s => s[0] === 'seapay')[2] <= 750);
  // Submarine duty pay cannot legally exceed $1,000 (FMR 7A Ch 23 para 2.3).
  ok('submarine duty pay is at or under the $1,000 statutory ceiling',
     SPECIALS.find(s => s[0] === 'sub')[2] <= 1000);
})();

G('Input hardening');
baseline(); set('other','1,500');   eq('"1,500" parses to 1500', calcScenario(1800,'NC',false).other, 1500);
baseline(); set('other','$200');    eq('"$200" parses to 200',   calcScenario(1800,'NC',false).other, 200);
baseline(); set('other','1,234,567'); eq('"1,234,567" parses',   calcScenario(1800,'NC',false).other, 1234567);
baseline(); set('other','1500,50'); eq('European "1500,50"',     calcScenario(1800,'NC',false).other, 1500.5);
baseline(); set('other','abc');     eq('junk text -> 0',         calcScenario(1800,'NC',false).other, 0);
baseline(); set('other','-999');    eq('negative deduction clamped to 0', calcScenario(1800,'NC',false).other, 0);
baseline(); set('tsp','-50');       eq('negative TSP clamped',   calcScenario(1800,'NC',false).tspAmt, 0);
baseline(); set('tsp','99999');
(() => { const x = calcScenario(1800,'NC',false); eq('TSP clamped to 100%', x.tspAmt, x.base); })();
baseline(); ok('negative BAH clamped', calcScenario(-5000,'NC',false).bah === 0);
baseline(); ok('NaN BAH clamped', calcScenario(NaN,'NC',false).bah === 0);
baseline(); set('filing','bogus');
ok('unknown filing status does not crash', Number.isFinite(calcScenario(1800,'NC',false).takeHome));
baseline(); set('yos','999');
ok('out-of-range YOS does not crash', Number.isFinite(calcScenario(1800,'NC',false).takeHome));
baseline(); set('grade','ZZ-9');
ok('unknown grade does not crash', Number.isFinite(calcScenario(1800,'NC',false).takeHome));

G('Cross-product sweep');
(() => {
  let invalid = 0, n = 0;
  ['E-1','E-5','E-9','W-5','O-1','O-6','O-10'].forEach(g =>
    Object.keys(STATES).forEach(c =>
      ['single','mfj','hoh'].forEach(f => {
        baseline(); set('grade', g); set('yos','12'); set('filing', f);
        const x = calcScenario(2200, c, exemptDefault(c)); n++;
        if (!Number.isFinite(x.takeHome) || x.stateTax < 0 || x.fedTax < 0 ||
            x.medi < 0 || x.ss < 0 || x.effRate < 0 || x.effRate >= 1) invalid++;
      })));
  ok(n + ' grade x state x filing combinations all valid', invalid === 0);
})();

G('Security: output escaping');
ok('esc neutralises angle brackets', A.esc('<b>') === '&lt;b&gt;');
ok('esc neutralises quotes', !/["']/.test(A.esc('"\'')));
(() => {
  const b = boot();
  b.el('labelA').value = '<img src=x onerror=alert(1)>';
  b.api.calculate();
  const out = b.writes['results'] || '';
  ok('injected tag not rendered raw', out.indexOf('<img') === -1);
  ok('injected payload is escaped', out.indexOf('&lt;img') !== -1);
})();
(() => {
  const b = boot();
  b.el('labelB').value = '"><script>alert(1)</script>';
  b.api.calculate();
  const out = b.writes['results'] || '';
  ok('no script tag injected', out.indexOf('<script>') === -1);
})();

G('Share link');
(() => {
  const a = boot();
  a.el('stationA').value = 'CA038'; a.el('bahA').value = '3975';
  a.el('grade').value = 'O-3'; a.el('deps').value = 'no';
  a.el('tsp').value = '12'; a.el('labelA').value = 'San Diego';
  const qs = a.api.collectState();
  const b = boot({ query: '?' + qs });
  ok('station restored', b.el('stationA').value === 'CA038');
  ok('BAH restored', b.el('bahA').value === '3975');
  ok('grade restored', b.el('grade').value === 'O-3');
  ok('dependents restored', b.el('deps').value === 'no');
  ok('TSP restored', b.el('tsp').value === '12');
  ok('label restored', b.el('labelA').value === 'San Diego');
  ok('results render from a shared link', (b.writes['results'] || '').length > 200);
})();
(() => {
  const b = boot({ query: '?filing=evil&tsp=-99&yos=abc&grade=ZZ&other=-500&bahA=-1' });
  ok('tampered link does not crash', !b.error);
  ok('tampered link still renders', (b.writes['results'] || '').length > 150);
})();
(() => {
  const good = boot({ navigator: { clipboard: { writeText: () => Promise.resolve() } } });
  good.fire('shareBtn');
  const bad = boot({ navigator: {}, secure: false, execOk: false,
    location: { protocol: 'file:', origin: 'null', pathname: '/a/index.html',
                href: 'file:///a/index.html', search: '' }, replaceThrows: true });
  bad.fire('shareBtn');
  ok('file:// share does not crash', !bad.error);
  ok('file:// skips history.replaceState', bad.replaceThrew() === false);
  ok('file:// gives guidance, not a false success', bad.el('shareBtn').textContent !== 'Link copied!');
})();

G('Resilience: missing or corrupted bah-data.js');
// `usable` = whether at least one area still has a valid rate row. When none do,
// the dropdown must disable itself rather than sit there empty.
[['no data file', '', false],
 ['null tables', 'const MHA_NAMES={"CA038":"SAN DIEGO, CA"};const BAH_W=null;const BAH_WO=null;', false],
 ['wrong types', 'const MHA_NAMES="oops";const BAH_W={};const BAH_WO={};', false],
 ['empty tables', 'const MHA_NAMES={};const BAH_W={};const BAH_WO={};', false],
 ['rows not arrays', 'const MHA_NAMES={"CA038":"X"};const BAH_W={"CA038":"nope"};const BAH_WO={};', false],
 ['truncated rows', 'const MHA_NAMES={"CA038":"X"};const BAH_W={"CA038":[3975,3975]};const BAH_WO={};', true]
].forEach(([label, src, usable]) => {
  const b = boot({ dataSrc: src });
  ok('boots with ' + label, !b.error);
  if (b.error) { console.log('        -> ' + b.error); return; }
  let threw = null; try { b.api.calculate(); } catch (e) { threw = e.message; }
  ok('calculates with ' + label, !threw);
  ok('renders with ' + label, (b.writes['results'] || '').length > 150);
  let lv = null, le = null;
  try { lv = b.api.bahLookup('CA038'); } catch (e) { le = e.message; }
  ok('lookup safe with ' + label, !le && (lv === null || Number.isFinite(lv)));
  if (usable) {
    ok('dropdown usable with ' + label, b.el('stationA').disabled === false);
  } else {
    ok('dropdown disabled (not silently empty) with ' + label, b.el('stationA').disabled === true);
    ok('placeholder explains why with ' + label,
       /unavailable/i.test(b.el('stationA').options[0].textContent));
  }
});

G('Accessibility');
(() => {
  const b = boot(); b.api.calculate();
  ok('screen-reader status is populated', (b.el('srStatus').textContent || '').length > 10);
  ok('status names both scenarios', /Scenario A[\s\S]*Scenario B[\s\S]*Difference/.test(b.el('srStatus').textContent));
  const c = boot(); c.el('compareOn').checked = false; c.api.calculate();
  ok('single-scenario status', /Estimated take-home/.test(c.el('srStatus').textContent));
})();
(() => {
  const head = html.slice(0, html.indexOf('<script src'));
  // hidden inputs carry state, not user-facing controls, so they need no label
  const inputs = [...head.matchAll(/<(?:input|select)[^>]*id="([^"]+)"[^>]*>/g)]
    .filter(m => !/type="hidden"/.test(m[0])).map(m => m[1]);
  const labels = new Set([...head.matchAll(/for="([^"]+)"/g)].map(m => m[1]));
  ok('every static control has a label', inputs.every(i => labels.has(i)));
  ok('generated amount inputs have aria-label', /aria-label="'\+esc\(label\)/.test(html));
  ok('live region present', /aria-live="polite"/.test(html));
  ok('page declares a language', /<html[^>]*lang=/.test(html));
  ok('viewport meta present', /name="viewport"/.test(html));
})();

G('Deployment metadata');
ok('social preview tags present', /og:image/.test(html) && /twitter:card/.test(html));
ok('canonical URL present', /rel="canonical"/.test(html));
ok('favicon present', /rel="icon"/.test(html));
ok('print stylesheet present', /@media print/.test(html));

// ----------------------------------------------------------------- report ---
const total = passed + failed;
console.log('\n' + '-'.repeat(52));
console.log(failed === 0
  ? 'PASS  ' + passed + '/' + total + ' checks'
  : 'FAIL  ' + failed + ' of ' + total + ' checks failed');
process.exit(failed === 0 ? 0 : 1);
