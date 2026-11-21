import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const adminCss=readFileSync(new URL('../admin-media.css',import.meta.url),'utf8');
const site=readFileSync(new URL('../site.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin.html',import.meta.url),'utf8');

test('public site includes small-screen layout and safe-area handling',()=>{
 assert.match(css,/@media\s*\(max-width:\s*700px\)/);
 assert.match(css,/@media\s*\(max-width:\s*380px\)/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/prefers-reduced-motion:\s*reduce/);
});

test('mobile navigation supports keyboard and outside-click dismissal',()=>{
 assert.match(site,/aria-expanded/);
 assert.match(site,/e\.key==='Escape'/);
 assert.match(site,/!e\.target\.closest\('nav'\)/);
 assert.match(site,/matchMedia\('\(min-width: 961px\)'\)/);
});

test('admin media controls have mobile breakpoints and refreshed stylesheet URL',()=>{
 assert.match(adminCss,/@media\s*\(max-width:\s*760px\)/);
 assert.match(adminCss,/@media\s*\(max-width:\s*520px\)/);
 assert.match(admin,/admin-media\.css\?v=20261121-2/);
});
