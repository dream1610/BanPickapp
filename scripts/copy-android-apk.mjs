import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const source = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const destination = path.join(root, 'installer', `Draft Console-${packageInfo.version}-android-debug.apk`);

await mkdir(path.dirname(destination), { recursive:true });
await copyFile(source, destination);
console.log(`Android APK copied to ${destination}`);
