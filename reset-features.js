/**
 * reset-features.js
 * 
 * Run this when features are marked passing but don't actually work.
 * Usage: node reset-features.js F005 F011
 * Or reset all: node reset-features.js --all
 */

const fs = require('fs');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node reset-features.js F005 F011');
  console.log('       node reset-features.js --all');
  process.exit(1);
}

const f = JSON.parse(fs.readFileSync('feature_list.json', 'utf8'));

if (args[0] === '--all') {
  f.features.forEach(x => {
    x.passes = false;
    x.notes = 'Reset — was marked passing but not verified end-to-end';
  });
  console.log(`Reset all ${f.features.length} features to failing`);
} else {
  args.forEach(id => {
    const feature = f.features.find(x => x.id === id);
    if (!feature) {
      console.log(`WARNING: Feature ${id} not found`);
      return;
    }
    feature.passes = false;
    feature.notes = 'Reset — was marked passing but not verified end-to-end';
    console.log(`Reset ${id}: ${feature.name}`);
  });
}

fs.writeFileSync('feature_list.json', JSON.stringify(f, null, 2));
console.log('\nDone. Run ./init.sh to see updated status.');
