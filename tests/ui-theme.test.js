const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('global theme is a final stylesheet layer, not a replacement application',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 assert.ok(html.indexOf('./ui-theme.css')>html.indexOf('./home.css'));
 assert.ok(html.indexOf('./ui-theme.css')<html.indexOf('./app.js'));
 assert.match(html,/name="theme-color" content="#09141d"/);
});

test('visual theme cannot hide actions, inject labels or replace selection behavior',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../web/ui-theme.css'),'utf8');
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none|\bvisibility\s*:\s*hidden|\bpointer-events\s*:\s*none|\border\s*:/);
 assert.doesNotMatch(css,/content\s*:\s*["'][^"']+["']/);
 assert.match(css,/\.seat\.selected\s*\{/);
 assert.match(css,/button:disabled\s*\{/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/--ui-small:\s*14px/);
 assert.match(css,/\.list-item > \.value\s*\{[^}]+white-space:\s*nowrap/);
 assert.match(css,/#app:not\(\.home-root\)/);
});
