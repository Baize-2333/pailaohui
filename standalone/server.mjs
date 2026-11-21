import {createServer} from 'node:http';
import {createReadStream,existsSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve,extname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {handle} from '../lib/game/service.mjs';
import {roomRepository} from '../lib/game/rooms.mjs';
import {withPages} from '../lib/game/pages.mjs';
import {gate} from '../lib/game/gate.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..'),pub=join(root,'public');
const data=resolve(process.env.DATA_DIR||join(root,'data'));mkdirSync(data,{recursive:true,mode:0o700});
const env={PAGES_ORIGIN:process.env.PAGES_ORIGIN};
const db=new DatabaseSync(join(data,'rooms.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000;');
db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
for(const filename of readdirSync(join(root,'drizzle')).filter(s=>s.endsWith('.sql')).sort()){
 if(!db.prepare('SELECT name FROM migrations WHERE name=?').get(filename)){
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(join(root,'drizzle',filename),'utf8'));db.prepare('INSERT INTO migrations VALUES(?)').run(filename);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 }}
const repo=roomRepository({
 first: (sql,...args)=>db.prepare(sql).get(...args),
 all: (sql,...args)=>db.prepare(sql).all(...args),
 change: (sql,...args)=>db.prepare(sql).run(...args).changes,
});
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>牌老汇·群友是㊗️</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/game/style.css"></head><body><main id="club"></main><div id="layers"></div><div id="notices" aria-live="polite"></div><script type="module" src="/game/client.js?v=open-lobby"></script></body></html>';
const types={'.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');const p=url.pathname;
 if(p==='/api/access'||p==='/api/table'){
 let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413).end();return}parts.push(chunk)}
 const origin=process.env.SITE_ORIGIN||'http://localhost';const request=new Request(origin+p+url.search,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
 const response=await withPages(request,env,async()=>p==='/api/access'?gate():handle(request,repo));
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return}
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
 if(p==='/'||p==='/lobby'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?'':html);return}
 const path=resolve(pub,'.'+decodeURIComponent(p));if(!path.startsWith(pub+sep)||!types[extname(path)]||!existsSync(path)){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':types[extname(path)],'X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else createReadStream(path).pipe(res)
 }catch{if(!res.headersSent)res.writeHead(500);res.end('请求暂时无法处理')}
}).listen(Number(process.env.PORT)||8080,process.env.HOST||'0.0.0.0',()=>console.log('牌老汇·群友是㊗️已启动，端口 '+(process.env.PORT||8080)+'。'));
