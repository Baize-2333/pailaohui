import {newGame,act,botAction,viewGame,ensure} from '../../public/game/engine.js';

import {modes,DEFAULT_MODE} from '../../public/game/modes.js';

const avatars=[25,1,4,7,39,54,94,133,143];
function clean(s,n){return typeof s==='string'?s.trim().slice(0,n):''}
function profile(a){return {name:clean(a.name,14)||'训练师',avatar:avatars.includes(a.avatar)?a.avatar:25}}
function code(){const abc='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(6))].map(n=>abc[n%abc.length]).join('')}
async function sessionHash(token){ensure(/^[a-f0-9-]{36,85}$/i.test(token),'请重新载入以取得座位');const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}
function seat(a,key){return {id:crypto.randomUUID(),key,...profile(a),bot:false,ready:false}}
const expose=({key,...s})=>s;
export function summary(r){return {code:r.code,title:r.title,mode:r.mode??DEFAULT_MODE,capacity:r.capacity,count:r.seats.length,status:r.status,host:r.seats.find(s=>s.id===r.host)?.name||'',avatar:r.seats[0]?.avatar||25}}
function publicView(r,p){return {...summary(r),listed:r.listed,hostId:r.host,you:p.id,seats:r.seats.map(expose),game:viewGame(r.game,p.id),rev:r.rev,chat:r.chat}}
function start(r){r.game=newGame(r.seats.map(expose),false,r.mode??DEFAULT_MODE);r.status='playing';runBots(r)}
function runBots(r){let guard=0;while(!r.game.done&&r.game.players[r.game.turn].bot&&guard++<18){const g=r.game;act(g,g.players[g.turn].id,botAction(g))}if(r.game.done)r.status='ended'}
function change(r,p,a){const host=p.id===r.host;
 if(a.kind==='chat'){const msg=clean(a.text,160);ensure(msg,'请输入消息');r.chat=[...r.chat,{id:crypto.randomUUID(),name:p.name,msg}].slice(-30);return}
 if(a.kind==='retire'){
  ensure(r.status==='playing','当前没有进行中的对局');
  const pl=r.game.players.find(s=>s.id===p.id);pl.bot=true;p.bot=true;p.key=null;p.name=pl.name=pl.name+'（托管）';
  runBots(r);return
 }
 if(a.kind==='move'){ensure(r.status==='playing','游戏尚未开始');act(r.game,p.id,a.move);runBots(r);return}
 if(a.kind==='rematch'){ensure(host&&r.status==='ended','由房主在结算后再开一局');r.status='waiting';r.game=null;r.seats.forEach(s=>s.ready=s.bot||s.id===r.host);return}
 ensure(r.status==='waiting','对局已经开始');
 if(a.kind==='ready'){p.ready=!!a.ready;return}
 if(a.kind==='leave'){r.seats=r.seats.filter(s=>s.id!==p.id);return}
 ensure(host,'只有房主可以操作');
 if(a.kind==='bot'){ensure(r.seats.length<r.capacity,'座位已满');const which=['小霞','小刚','阿渡'].find(n=>!r.seats.some(s=>s.bot&&s.name===n));r.seats.push({id:crypto.randomUUID(),name:which,avatar:[7,54,4][r.seats.length-1],ready:true,bot:true,key:null});return}
 if(a.kind==='remove'){ensure(a.id!==r.host&&r.seats.some(s=>s.id===a.id),'找不到座位');r.seats=r.seats.filter(s=>s.id!==a.id);return}
 if(a.kind==='start'){ensure(r.seats.length>=2&&r.seats.every(s=>s.ready),'至少两人入座，并且全员准备后才能开始');start(r);return}
 throw Error('房间操作无效');
}
function response(x,status=200){return Response.json(x,{status,headers:{'Cache-Control':'no-store'}})}
export async function handle(req,repo){
 try{const u=new URL(req.url),raw=req.headers.get('authorization')||'',key=await sessionHash(raw.replace(/^Bearer /,''));
 if(req.method==='GET'){const c=u.searchParams.get('room');if(!c)return response({rooms:await repo.list()});
 const r=await repo.read(c,key);if(!r||r.status==='closed')return response({error:'房间已解散或已过期'},404);
 const p=r.seats.find(s=>s.key===key);return p?response(publicView(r,p)):response({error:'尚未加入这个房间'},403)}
 ensure(req.method==='POST','请求方法无效');const a=await req.json();
 if(a.kind==='create'){const p=seat(a,key);p.ready=true;const cap=Number(a.capacity);ensure([2,3,4].includes(cap),'房间人数为 2 至 4 人');
 const mode=a.mode??DEFAULT_MODE;ensure(typeof mode==='string'&&Object.hasOwn(modes,mode),'请选择萌新、中等或高手模式');
 for(let i=0;i<4;i++){const r={code:code(),mode,title:clean(a.title,24)||p.name+'的房间',listed:a.listed!==false,capacity:cap,status:'waiting',host:p.id,seats:[p],chat:[],rev:1,game:null};if(await repo.create(r))return response(publicView(r,p))}throw Error('未能分配房间号，请再试一次')}
 ensure(/^[A-Z2-9]{6}$/.test(a.code),'请输入 6 位房间号');const leaving=['leave','retire','dissolve'].includes(a.kind);
 const r=await repo.read(a.code,key);if(!r||r.status==='closed')return leaving?response({left:true}):response({error:'房间已解散或已过期'},404);
 let p=r.seats.find(s=>s.key===key);const prev=r.rev;
 if(leaving&&p?.id===r.host){await repo.closeByHost(r.code,p.id);return response({left:true})}
 if(a.kind==='dissolve')return response({error:'只有房主可以解散房间'},403);
 if(a.kind==='join'){if(p)return response(publicView(r,p));ensure(r.status==='waiting'&&r.seats.length<r.capacity,'房间已满或对局已开始');p=seat(a,key);r.seats.push(p)}
 else {ensure(p,'请先加入房间');if(a.rev!==prev&&a.kind!=='chat')return response({error:'房间已更新，请按最新牌局操作'},409);change(r,p,a)}
 r.rev++;if(!await repo.update(r,prev))return response({error:'房间刚刚有变动，请重试'},409);
 return response(['leave','retire'].includes(a.kind)?{left:true}:publicView(r,p))
 }catch(e){return response({error:e.message||'请求失败'},400)}
}
