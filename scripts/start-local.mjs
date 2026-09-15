import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(command,args,env=process.env){const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status || 1);}
if(!existsSync(path.join(root,'node_modules'))) run(npm,['ci']);
mkdirSync(path.join(root,'.local'),{recursive:true});
const passwordFile=path.join(root,'.local','.admin-password');
if(!existsSync(passwordFile)) {
 const previous=path.join(root,'.wrangler','.admin-password');
 writeFileSync(passwordFile,existsSync(previous)?readFileSync(previous,'utf8').trim():randomBytes(24).toString('base64url'),{mode:0o600});
}
if(existsSync(path.join(root,'.env.local'))) process.loadEnvFile(path.join(root,'.env.local'));
const env={...process.env,ADMIN_USER:process.env.ADMIN_USER || 'admin',ADMIN_PASSWORD:process.env.ADMIN_PASSWORD || readFileSync(passwordFile,'utf8').trim(),ALLOW_LOCAL_DB:'1',NEXT_TELEMETRY_DISABLED:'1'};
if(!env.DATABASE_URL) {run(process.execPath,['--import','tsx','scripts/migrate-db.ts'],env);run(process.execPath,['--import','tsx','scripts/seed-db.ts'],env);}
console.log('\nPortal: http://127.0.0.1:8787/index.html\nAdmin: http://127.0.0.1:8787/admin\nUsuário: '+env.ADMIN_USER+'\nSenha local: .local/.admin-password (ou ADMIN_PASSWORD configurada).\nCtrl+C para encerrar.\n');
run(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','8787'],env);
