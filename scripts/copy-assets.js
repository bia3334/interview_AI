// Cross-platform copy of the extra HTML windows into the Angular build output.
// Replaces the Windows-only `copy` shell command so `npm start` / `npm run build`
// work on Windows, macOS and Linux alike.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const destDir = path.join(root, 'dist', 'angular');
const files = ['overlay.html', 'region-selection.html'];

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = path.join(root, 'src', file);
  const dest = path.join(destDir, file);
  fs.copyFileSync(src, dest);
  console.log(`copied ${file} -> dist/angular/`);
}
