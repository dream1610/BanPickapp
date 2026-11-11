import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const assetsDirectory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const assetFiles = await readdir(assetsDirectory);
const javascriptFiles = assetFiles.filter((fileName) => fileName.endsWith('.js'));
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.65,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
};

if (javascriptFiles.length === 0) {
  throw new Error(`No JavaScript bundles found in ${assetsDirectory}`);
}

for (const fileName of javascriptFiles) {
  const filePath = join(assetsDirectory, fileName);
  const source = await readFile(filePath, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(source, obfuscatorOptions);
  await writeFile(filePath, obfuscated.getObfuscatedCode());
}

const electronMainPath = fileURLToPath(new URL('../electron/main.cjs', import.meta.url));
const protectedMainPath = fileURLToPath(new URL('../electron/main.protected.cjs', import.meta.url));
const electronMain = await readFile(electronMainPath, 'utf8');
const protectedMain = JavaScriptObfuscator.obfuscate(electronMain, obfuscatorOptions);
await writeFile(protectedMainPath, protectedMain.getObfuscatedCode());

console.log(`Obfuscated ${javascriptFiles.length} web bundle(s) and the Electron main process.`);