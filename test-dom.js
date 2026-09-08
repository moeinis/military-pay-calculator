#!/usr/bin/env node
/*
 * Browser-DOM integration tests for the Military Take-Home Pay Estimator.
 *
 *   npm install jsdom      (one time)
 *   node test-dom.js
 *
 * test.js exercises the calculation engine against a stubbed DOM. This file is
 * the complement: it parses the real index.html in a real DOM implementation,
 * executes the real scripts, and drives the UI with real dispatched events.
 * That catches anything a hand-written stub could paper over — option elements
 * that never get created, listeners that never fire, escaping that only looks
 * safe as a string.
 *
 * Not covered: visual layout. jsdom has no renderer, so how the page *looks*
 * still needs a human with a browser.
 *
 * Exit code 0 = all passed, 1 = failures, 2 = jsdom not installed.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch (e) {
  console.log('jsdom is not installed — skipping DOM integration tests.');
  console.log('Install it with:  npm install jsdom');
  process.exit(2);
}

const DIR = __dirname;
const URL_ = 'https://blue-star-families1.github.io/military-pay-calculator/';

// Inline bah-data.js so script execution order matches a real browser.
let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const bahSrc = fs.readFileSync(path.join(DIR, 'bah-data.js'), 'utf8');
html = html.replace('<script src="bah-data.js"></script>', '<script>' + bahSrc + '</script>');

// Rate tables, read independently, so expectations come from the data itself
// rather than from hardcoded numbers that could drift after a yearly update.
const data = {};
new Function('g', bahSrc + ';g.BAH_W=BAH_W;g.BAH_WO=BAH_WO;g.MHA_NAMES=MHA_NAMES;')(data);
const COL = { 'E-5': 4, 'O-3': 19 };
const SD = 'CA038';   // San Diego — present in every published rate table

const runtimeErrors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/fonts\.googleapis|Could not load link/.test(e.message)) runtimeErrors.push(e.message); });
vc.on('error', (...a) => runtimeErrors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: URL_, virtualConsole: vc
});
const w = dom.window, d = w.document;

let passed = 0, failed = 0;
const G = g => console.log('\n' + g);
const ok = (name, cond) => { if (cond) passed++; else { failed++; console.log('  FAIL  ' + name); } };
const eq = (name, got, want) => {
  if (String(got) === String(want)) passed++;
  else { failed++; console.log('  FAIL  ' + name + '  got ' + got + '  want ' + want); }
};
const $ = id => d.getElementById(id);
const fire = (el, ev) => el.dispatchEvent(new w.Event(ev, { bubbles: true }));
const cards = () => $('results').querySelectorAll('.res-card');
const takeHome = i => { const c = cards()[i]; return c ? c.querySelector('.line.total .v').textContent : null; };
const money = n => '$' + Math.round(n).toLocaleString('en-US');

setTimeout(() => {
  G('Page load');
  ok('no runtime errors', runtimeErrors.length === 0);
  if (runtimeErrors.length) runtimeErrors.slice(0, 3).forEach(e => console.log('        ' + e));

  G('Controls are really populated');
  ok('pay grades listed', $('grade').options.length >= 28);
  ok('under-4-months E-1 offered first', $('grade').options[0].textContent === 'E-1 <4mo');
  ok('all rated duty stations listed',
     $('stationA').options.length === Object.keys(data.BAH_W).length + 1); // +1 placeholder
  ok('station dropdown enabled when data loads', $('stationA').disabled === false);
  ok('unmapped placeholder area excluded',
     ![...$('stationA').options].some(o => /UNKNOWN/i.test(o.textContent)));
  eq('all states and DC listed', $('stateA').options.length, 51);
  eq('special-pay rows generated', $('specials').querySelectorAll('input[type=checkbox]').length, 12);
  ok('special-pay amounts carry an aria-label',
     $('specials').querySelectorAll('input[type=number][aria-label]').length === 12);

  G('Initial render');
  ok('results render on load', $('results').innerHTML.length > 300);
  eq('two comparison cards', cards().length, 2);
  ok('take-home shown as a dollar figure', /^\$[\d,]+$/.test(takeHome(0)));
  ok('difference summary populated', $('diffBox').textContent.includes('mo'));

  G('BAH auto-fill driven by real events');
  $('grade').value = 'E-5'; fire($('grade'), 'change');
  $('deps').value = 'yes'; fire($('deps'), 'change');
  $('stationA').value = SD; fire($('stationA'), 'change');
  eq('selecting a station fills BAH', $('bahA').value, String(data.BAH_W[SD][COL['E-5']]));
  const afterStation = takeHome(0);
  $('grade').value = 'O-3'; fire($('grade'), 'change');
  eq('changing rank refills BAH', $('bahA').value, String(data.BAH_W[SD][COL['O-3']]));
  ok('take-home responds to rank change', takeHome(0) !== afterStation);
  $('deps').value = 'no'; fire($('deps'), 'change');
  eq('dependents toggle switches rate table', $('bahA').value, String(data.BAH_WO[SD][COL['O-3']]));
  $('deps').value = 'yes'; fire($('deps'), 'change');

  G('Typed input recalculates');
  $('tsp').value = '0'; fire($('tsp'), 'input');
  const tsp0 = parseInt(takeHome(0).replace(/\D/g, ''), 10);
  $('tsp').value = '15'; fire($('tsp'), 'input');
  const tsp15 = parseInt(takeHome(0).replace(/\D/g, ''), 10);
  ok('higher TSP reduces take-home', tsp15 < tsp0);
  $('tsp').value = '5'; fire($('tsp'), 'input');

  G('Combat zone');
  $('combat').checked = true; fire($('combat'), 'input');
  ok('combat exclusion labelled in the breakdown', /combat-excluded/.test(cards()[0].textContent));
  $('combat').checked = false; fire($('combat'), 'input');

  G('State selection updates guidance and exemption');
  $('stateA').value = 'TX'; fire($('stateA'), 'change');
  ok('no-tax state auto-exempts', $('exemptA').checked === true);
  ok('no-tax state explained', /No state income tax/i.test($('stateNoteA').textContent));
  $('stateA').value = 'VA'; fire($('stateA'), 'change');
  ok('taxing state is not auto-exempt', $('exemptA').checked === false);
  $('stateA').value = 'CA'; fire($('stateA'), 'change');
  ok('conditional state explains the stationed-elsewhere rule',
     /stationed/i.test($('stateNoteA').textContent));
  $('stateA').value = 'NC'; fire($('stateA'), 'change');

  G('Cross-site scripting, executed for real');
  $('labelA').value = '<img src=x onerror="window.__pwned=1">'; fire($('labelA'), 'input');
  ok('no element injected into the DOM', $('results').querySelectorAll('img').length === 0);
  ok('payload did not execute', w.__pwned === undefined);
  $('labelA').value = '"><script>window.__pwned2=1</' + 'script>'; fire($('labelA'), 'input');
  ok('script tag not injected', $('results').querySelectorAll('script').length === 0);
  ok('second payload did not execute', w.__pwned2 === undefined);
  $('labelA').value = ''; fire($('labelA'), 'input');

  G('Single-scenario mode');
  $('compareOn').checked = false; fire($('compareOn'), 'change');
  eq('one card when comparison is off', cards().length, 1);
  $('compareOn').checked = true; fire($('compareOn'), 'change');
  eq('two cards when comparison is on', cards().length, 2);

  G('Accessibility in a real document');
  ok('page declares a language', d.documentElement.getAttribute('lang') === 'en');
  ok('single top-level heading', d.querySelectorAll('h1').length === 1);
  ok('polite live region present', $('srStatus').getAttribute('aria-live') === 'polite');
  const controls = [...d.querySelectorAll('main input, main select')];
  const labelled = controls.filter(el =>
    (el.id && d.querySelector('label[for="' + el.id + '"]')) || el.getAttribute('aria-label'));
  ok('every control has a label (' + labelled.length + '/' + controls.length + ')',
     labelled.length === controls.length);
  ok('external links are rel=noopener',
     [...d.querySelectorAll('a[target="_blank"]')].every(a => /noopener/.test(a.rel)));

  G('Feedback section');
  (() => {
    const btn = $('feedbackBtn');
    ok('feedback button present', !!btn);
    ok('button resolves to a real destination',
       btn && /^https:\/\//i.test(btn.getAttribute('href') || ''));
    ok('button opens in a new tab safely',
       btn && btn.target === '_blank' && /noopener/.test(btn.rel));
    const txt = d.querySelector('.feedback').textContent;
    ok('asks whether the estimate was accurate', /accurate or inaccurate/i.test(txt));
    ok('asks how it could be improved', /how can we improve/i.test(txt));
    ok('asks about missing fields', /fields or situations missing/i.test(txt));
    ok('explains why name and email are collected', /name and email/i.test(txt));
    ok('promises the details are not public', /never shown publicly/i.test(txt));
    ok('warns against sensitive details', /account numbers/i.test(txt));
    // With no form configured, the button must fall back rather than dead-link.
    const configured = /forms\.gle|docs\.google\.com/i.test(btn.getAttribute('href') || '');
    ok('unconfigured build hides the duplicate GitHub link',
       configured || ($('fbAlt') && $('fbAlt').style.display === 'none'));
  })();

  G('Shared link restores state in a real document');
  (() => {
    const q = '?grade=O-3&yos=4&filing=mfj&deps=yes&tsp=5&sgli=31&other=0' +
              '&stationA=' + SD + '&bahA=' + data.BAH_W[SD][COL['O-3']] +
              '&stateA=VA&exemptA=0&labelA=San+Diego&compareOn=0';
    const d2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
      url: URL_ + q, virtualConsole: vc });
    const g2 = id => d2.window.document.getElementById(id);
    setTimeout(() => {
      eq('grade restored', g2('grade').value, 'O-3');
      eq('station restored', g2('stationA').value, SD);
      eq('BAH restored', g2('bahA').value, String(data.BAH_W[SD][COL['O-3']]));
      eq('label restored', g2('labelA').value, 'San Diego');
      ok('results rendered from the link', g2('results').innerHTML.length > 300);
      report();
    }, 250);
  })();
}, 400);

function report() {
  const total = passed + failed;
  console.log('\n' + '-'.repeat(52));
  console.log(failed === 0
    ? 'PASS  ' + passed + '/' + total + ' DOM integration checks'
    : 'FAIL  ' + failed + ' of ' + total + ' DOM checks failed');
  console.log('Note: jsdom has no renderer — visual layout is still unverified.');
  process.exit(failed === 0 ? 0 : 1);
}
