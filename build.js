// Inlines src/*.js into src/shell.html and writes the single self-contained index.html.
// Only needed if you edit the files in src/; index.html is already built.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'src');
const shell = fs.readFileSync(path.join(dir, 'shell.html'), 'utf8');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const js = files.map(f => `// ---- ${f} ----\n` + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const parts = shell.split('/*__GAME_SCRIPTS__*/');
if (parts.length !== 2) throw new Error('marker missing in shell.html');
fs.writeFileSync(path.join(__dirname, 'index.html'), parts[0] + js + parts[1]);
console.log(`built index.html from ${files.length} modules (${Math.round((parts[0].length + js.length + parts[1].length) / 1024)} KB)`);
