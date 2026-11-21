import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gate} from '../lib/game/gate.mjs';
import {withPages} from '../lib/game/pages.mjs';

test('cached clients enter the public lobby without credentials',async()=>{
 const res=gate();
 assert.deepEqual(await res.json(),{open:true});
 assert.equal(res.headers.get('Set-Cookie'),null);
});

test('each configured frontend receives its own CORS origin on both API routes',async()=>{
 const origins=['https://test.github.io','https://game.maozi.io'];
 const env={PAGES_ORIGIN:origins.join(', ')};
 for(const origin of origins){
  for(const route of ['access','table']){
   const req=new Request('https://game.test/api/'+route,{method:'OPTIONS',headers:{origin}});
   const res=await withPages(req,env,()=>assert.fail());
   assert.equal(res.status,204);
   assert.equal(res.headers.get('Access-Control-Allow-Origin'),origin);
   assert.match(res.headers.get('Vary'),/Origin/i);
  }
 }
 const req=new Request('https://game.test/api/access',{method:'OPTIONS',headers:{origin:'https://other.maozi.io'}});
 const denied=await withPages(req,env,()=>assert.fail());
 assert.equal(denied.status,403);
 assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
});
