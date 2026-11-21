import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gate,allowed} from '../lib/game/gate.mjs';
import {withPages} from '../lib/game/pages.mjs';

test('Pages uses a password-protected ticket and the original site keeps HttpOnly cookies',async()=>{
 const env={PAGES_ORIGIN:'https://test.github.io',CLUB_PASSWORD:crypto.randomUUID(),SESSION_SIGNING_KEY:crypto.randomUUID()};
 const endpoint='https://game.test/api/access';
 function request(origin,body,extra={}){
  return new Request(endpoint,{method:body?'POST':'GET',headers:{...(origin?{origin}:{}),...extra},body:body?JSON.stringify(body):undefined});
 }
 const login=async(req)=>withPages(req,env,()=>gate(req,env));
 const deny=await login(request(env.PAGES_ORIGIN,{password:'wrong'}));assert.equal(deny.status,401);
 const pages=await login(request(env.PAGES_ORIGIN,{password:env.CLUB_PASSWORD}));
 assert.equal(pages.headers.get('Access-Control-Allow-Origin'),env.PAGES_ORIGIN);
 assert.equal(pages.headers.get('Set-Cookie'),null);
 const ticket=(await pages.json()).session;
 assert.ok(ticket);
 const verified=request(env.PAGES_ORIGIN,null,{'X-Club-Session':ticket});
 assert.ok(await allowed(verified,env));
 assert.equal(await allowed(request('https://elsewhere.test',null,{'X-Club-Session':ticket}),env),false);
 const preflight=new Request(endpoint,{method:'OPTIONS',headers:{origin:env.PAGES_ORIGIN}});
 const options=await withPages(preflight,env,()=>assert.fail());
 assert.equal(options.status,204);assert.ok(options.headers.get('Access-Control-Allow-Headers').includes('X-Club-Session'));
 const local=await login(request(null,{password:env.CLUB_PASSWORD}));
 assert.ok(local.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await local.json()).session,undefined);
 const cookie=local.headers.get('set-cookie').split(';')[0];
 assert.ok(await allowed(request(null,null,{cookie}),env));
 env.CLUB_PASSWORD=crypto.randomUUID();
 assert.equal(await allowed(verified,env),false);assert.equal(await allowed(request(null,null,{cookie}),env),false);
});
