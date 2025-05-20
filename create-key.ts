import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const randomKey = randomBytes(16).toString("hex");
const envPath = resolve(process.cwd(), '.env');
let envContent = '';

if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf8');
  // Remove any existing ENCRYPTION_KEY line
  envContent = envContent.replace(/^ENCRYPTION_KEY=.*$/m, '');
  // Ensure trailing newline
  if (!envContent.endsWith('\n')) envContent += '\n';
}

envContent += `ENCRYPTION_KEY="${randomKey}\n`;
writeFileSync(envPath, envContent);

console.log(`Generated random key: ${randomKey} (written to .env as ENCRYPTION_KEY)`);