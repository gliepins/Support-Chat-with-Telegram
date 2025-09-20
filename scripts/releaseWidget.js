#!/usr/bin/env node
const { execSync } = require('child_process');
const d = new Date();
const v = d.toISOString().slice(0,16).replace(/[-:T]/g,''); // e.g. 202509201912
let sha = '';
try { sha = execSync('git rev-parse --short HEAD').toString().trim(); } catch {}
const ver = sha ? `${v}-${sha}` : v;
const snippet = `
Paste this into your Contact page:

<script src="https://cms.autoroad.lv/widget.js?v=${ver}"></script>
<script>window.SupportChat&&SupportChat.init({position:"right"});</script>
`;
process.stdout.write(snippet);
