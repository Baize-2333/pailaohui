import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handle} from '../lib/game/service.mjs';
import {roomRepository,HOST_TIMEOUT_MS} from '../lib/game/rooms.mjs';

function fixture(t) {
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  const directory=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(directory).filter(s=>s.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(file,directory),'utf8'));
  }
  let time=Date.now();
  const repo=roomRepository({
    first:(sql,...args)=>db.prepare(sql).get(...args),
    all:(sql,...args)=>db.prepare(sql).all(...args),
    change:(sql,...args)=>db.prepare(sql).run(...args).changes,
  },()=>time);
  const tokens={host:crypto.randomUUID(),guest:crypto.randomUUID(),visitor:crypto.randomUUID()};
  async function call(who,body,code) {
    const request=new Request('https://club.test/api/table'+(code?'?room='+code:''),{
      method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[who]},body:body?JSON.stringify(body):undefined,
    });
    const response=await handle(request,repo);
    return {status:response.status,data:await response.json()};
  }
  async function create(listed=true) {
    const created=await call('host',{kind:'create',name:'房主',capacity:4,listed});
    assert.equal(created.status,200);return created.data;
  }
  async function action(who,room,kind,extra={}) {
    const result=await call(who,{code:room.code,rev:room.rev,kind,...extra});
    assert.equal(result.status,200,JSON.stringify(result.data));return result.data;
  }
  return {db,repo,call,create,action,advance:delta=>{time+=delta}};
}

test('host departure closes a waiting room even with stale revision, guests and a bot',async t=>{
  const {create,action,call,repo}=fixture(t);
  const initial=await create();
  const bot=await action('host',initial,'bot');
  await action('guest',bot,'join');
  assert.equal((await call('guest',{kind:'dissolve',code:initial.code})).status,403);
  const old=await repo.read(initial.code);
  assert.deepEqual(await action('host',initial,'leave'),{left:true});
  assert.equal(await repo.update(old,old.rev),false);
  assert.deepEqual((await call('visitor')).data.rooms,[]);
  assert.equal((await call('guest',null,initial.code)).status,404);
  assert.equal((await call('visitor',{kind:'join',code:initial.code})).status,404);
  assert.deepEqual(await action('host',initial,'dissolve'),{left:true});
});

test('guest exit only releases their seat, or hands their seat to a bot during play',async t=>{
  const {create,action,call}=fixture(t);
  const initial=await create(false);
  let room=await action('guest',initial,'join');
  await action('guest',room,'leave');
  room=(await call('host',null,room.code)).data;
  assert.equal(room.count,1);assert.equal(room.you,room.hostId);
  room=await action('guest',room,'join');
  room=await action('guest',room,'ready',{ready:true});
  room=await action('host',room,'start');
  await action('guest',room,'retire');
  room=(await call('host',null,room.code)).data;
  assert.equal(room.status,'playing');assert.equal(room.you,room.hostId);
  assert.equal(room.seats.filter(s=>s.bot).length,1);
  await action('host',initial,'retire');
  assert.equal((await call('host',null,room.code)).status,404);
});

test('same host reconnects during grace; guests, chat, listings and foreign tokens never renew it',async t=>{
  const {create,action,call,advance}=fixture(t);
  const room=await create();
  const joined=await action('guest',room,'join');
  advance(HOST_TIMEOUT_MS-1);
  const reconnect=await call('host',null,room.code);
  assert.equal(reconnect.data.you,room.you);assert.equal(reconnect.data.rev,joined.rev);
  advance(HOST_TIMEOUT_MS-1);
  assert.equal((await call('visitor',null,room.code)).status,403);
  await action('guest',joined,'chat',{text:'房主还在吗？'});
  assert.equal((await call('guest',null,room.code)).status,200);
  assert.equal((await call('visitor')).data.rooms.length,1);
  advance(1);
  assert.deepEqual((await call('visitor')).data.rooms,[]);
  assert.equal((await call('host',null,room.code)).status,404);
  assert.equal((await call('guest',null,room.code)).status,404);
  assert.equal((await call('visitor',{kind:'join',code:room.code})).status,404);
});

test('unlisted running rooms also expire with an obsolete invite or in-flight action',async t=>{
  const {repo,create,action,call,advance}=fixture(t);
  let room=await create(false);
  room=await action('host',room,'bot');room=await action('host',room,'start');
  const stale=await repo.read(room.code);
  advance(HOST_TIMEOUT_MS);
  assert.equal(await repo.update(stale,stale.rev),false);
  assert.equal((await call('host',null,room.code)).status,404);
  assert.equal((await call('visitor',{kind:'join',code:room.code})).status,404);
});

test('old public and private rooms receive one upgrade grace period; older abandoned rooms stay expired',async t=>{
  const {db,create,call,advance}=fixture(t);
  const pub=await create(),priv=await create(false),old=await create();
  db.exec('UPDATE rooms SET host_seen=NULL');
  db.prepare('UPDATE rooms SET updated=0 WHERE code=?').run(old.code);
  assert.deepEqual((await call('visitor')).data.rooms.map(r=>r.code),[pub.code]);
  assert.equal((await call('visitor',null,priv.code)).status,403);
  assert.equal((await call('host',null,old.code)).status,404);
  advance(HOST_TIMEOUT_MS);
  assert.deepEqual((await call('visitor')).data.rooms,[]);
  assert.equal((await call('host',null,priv.code)).status,404);
  assert.equal((await call('host',null,pub.code)).status,404);
});
