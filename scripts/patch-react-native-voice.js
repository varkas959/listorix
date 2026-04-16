const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'android',
  'build.gradle'
);

if (!fs.existsSync(targetPath)) {
  console.log('[patch-react-native-voice] Skipped: build.gradle not found');
  process.exit(0);
}

const original = fs.readFileSync(targetPath, 'utf8');

const next = original
  .replace(
    /implementation\s+"com\.android\.support:appcompat-v7:\$\{supportVersion\}"/g,
    'implementation "androidx.appcompat:appcompat:1.7.0"'
  )
  .replace(/\bjcenter\(\)/g, 'mavenCentral()');

if (next === original) {
  console.log('[patch-react-native-voice] No changes needed');
  process.exit(0);
}

fs.writeFileSync(targetPath, next, 'utf8');
console.log('[patch-react-native-voice] Applied AndroidX compatibility patch');
