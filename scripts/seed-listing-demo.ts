/**
 * Writes the Play Store listing demo CSV and prints how to load it on device.
 * Run: npm run seed:demo
 *
 * This does not decrypt the phone vault. The in-app Settings action replaces
 * an empty vault (or one already tagged `demo`) with the same catalog.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportListingDemoCsv, listingDemoDrafts } from '../packages/core/src/vault/listing-demo';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'docs/store/listing-demo.csv');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, exportListingDemoCsv(), 'utf8');

const titles = listingDemoDrafts()
  .map((d) => d.title)
  .join(', ');

console.log(`Wrote ${outPath}`);
console.log(`${listingDemoDrafts().length} demo keys: ${titles}`);
console.log('');
console.log('On the phone (dev client, unlocked vault):');
console.log('  Settings → Ficha Play Store → Cargar datos de demo');
console.log('  Type DEMO to confirm. Refuses vaults that still have real (non-demo) keys.');
console.log('  Enables screenshots for the listing session.');
console.log('');
console.log('Or import this CSV into an empty vault (Security → Import).');
