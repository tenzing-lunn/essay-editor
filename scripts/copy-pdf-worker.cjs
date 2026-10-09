// Serves the pdf.js worker and character maps from this origin (CSP: no CDNs). Runs before dev and build.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'node_modules/pdfjs-dist');
const worker = path.join(dist, 'build/pdf.worker.min.mjs');
if (!fs.existsSync(worker)) {
  console.warn('copy-pdf-worker: pdfjs-dist is not installed; PDF import will not work until `npm install` runs.');
  process.exit(0);
}
const out = path.join(root, 'public/pdfjs');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(worker, path.join(out, 'pdf.worker.min.mjs'));
fs.cpSync(path.join(dist, 'cmaps'), path.join(out, 'cmaps'), { recursive: true });
