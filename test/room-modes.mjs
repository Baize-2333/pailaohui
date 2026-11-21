import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handle,summary} from '../lib/game/service.mjs';
import {cards,cardMap,newGame,viewGame,act,botAction,points,zero} from '../public/game/engine.js';
import {personalHints} from '../public/game/advice.js';
import {cardTile} from '../public/game/ui.js';

test('each room keeps its creation mode through guest joins, play, reconnect and rematch',async()=>{
  const data=new Map();
  const repo={
    read:async code=>structuredClone(data.get(code)),
    list:async()=>Array.from(data.values(),summary),
    create:async r=>{data.set(r.code,structuredClone(r));return true},
    update:async(r,prev)=>{assert.equal(data.get(r.code).rev,prev);data.set(r.code,structuredClone(r));return true}
  };
  const users=[crypto.randomUUID(),crypto.randomUUID()];
  async function call(index,body,query='') {
    const request=new Request('https://example.test/api/table'+query,{method:body?'POST':'GET',headers:{authorization:'Bearer '+users[index]},body:body?JSON.stringify(body):undefined});
    const response=await handle(request,repo);
    return {status:response.status,data:await response.json()};
  }
  assert.equal((await call(0,{kind:'create',capacity:2,mode:'anything'})).status,400);
  const legacy=(await call(0,{kind:'create',capacity:2})).data;
  assert.equal(legacy.mode,'standard');
  delete data.get(legacy.code).mode;
  assert.equal((await call(0,null,'?room='+legacy.code)).data.mode,'standard');
  for(const mode of ['beginner','standard','expert']){
    let room=(await call(0,{kind:'create',capacity:2,mode})).data;
    const code=room.code;
    let other=(await call(1,{kind:'join',code,mode:'unrequested-change'})).data;
    assert.equal(other.mode,mode);
    assert.equal((await call(0,null)).data.rooms.find(r=>r.code===code).mode,mode);
    async function update(index,kind,extra={}){
      const v=await call(index,{kind,code,rev:other.rev,...extra});assert.equal(v.status,200,JSON.stringify(v.data));other=v.data;return other;
    }
    await update(1,'ready',{ready:true});
    room=await update(0,'start');
    assert.equal(room.game.mode,mode);
    for(let i=0;i<450&&!other.game.done;i++){
      const active=other.game.players[other.game.turn].id===room.you?0:1;
      const fresh=(await call(active,null,'?room='+code)).data;
      assert.equal(fresh.mode,mode);
      await update(active,'move',{move:botAction(fresh.game)});
    }
    assert.ok(other.game.done);assert.ok(other.game.players.some(p=>points(p)>=18));
    const again=await update(0,'rematch',{mode:'something else'});
    assert.equal(again.status,'waiting');assert.equal(again.mode,mode);
  }
});

test('printed evolution requirements match every card, regardless of player or mode',()=>{
  for(const c of cards){const tile=cardTile(c.id);
    if(c.evoCost) {assert.ok(tile.includes('进化条件'));assert.ok(tile.includes('奖励 ×'+c.evoCost.count))}
    else assert.ok(!tile.includes('进化条件'));
    assert.ok(!tile.includes('personal-status'));
  }
});

test('same market card has different private status and hidden reserves stay hidden',()=>{
  const g=newGame([{id:'a'},{id:'b'}],true);
  const [a,b]=g.players,c=cardMap.s1_01;
  const evolved=cards.find(x=>c.evolvesTo.includes(x.name));
  const visible='s1_03';
  g.market=[[visible],[],[],[],[]];
  a.owned=[c.id,...cards.filter(x=>x.bonus===c.evoCost.color&&x.id!==c.id).slice(0,c.evoCost.count).map(x=>x.id)];
  a.balls={...zero(),blue:4};a.reserved=[evolved.id];b.reserved=['s1_07'];
  const vA=viewGame(g,'a'),vB=viewGame(g,'b');
  assert.deepEqual(vA.players[1].reserved,[null]);assert.deepEqual(vB.players[0].reserved,[null]);
  const hintsA=personalHints(vA,'a','standard'),hintsB=personalHints(vB,'b','standard');
  assert.ok(hintsA.status[visible].affordable);assert.equal(hintsB.status[visible].affordable,false);
  assert.equal(hintsA.status[c.id].evolution,'可进化');assert.equal(hintsA.status[evolved.id].evolution,'进化目标');
  assert.equal(hintsB.status[evolved.id],undefined);assert.equal(hintsA.route,null);
  const guides=personalHints(vA,'a','beginner');
  assert.ok(guides.route.steps.length && guides.route.reason);
  g.players[1].reserved=['s1_04'];
  assert.deepEqual(personalHints(viewGame(g,'a'),'a','beginner'),guides);
  assert.equal(personalHints(vA,'a','expert'),null);
  assert.ok(!JSON.stringify(vA).includes('routeGoal'));
});

test('expert end phase never identifies legal pairs and the engine validates a chosen pair',()=>{
 const g=newGame([{id:'a'},{id:'b'}],true,'expert');
 act(g,'a',{type:'take',balls:{red:1,blue:1,pink:1}});
 assert.equal(g.phase,'evolve');assert.equal(viewGame(g,'b').phase,'waiting');
 assert.throws(()=>act(g,'a',{type:'evolve',from:'s1_01',to:'s2_01'}));
 act(g,'a',{type:'end'});assert.equal(g.turn,1);
 const source=cardMap.s1_01, next=cards.find(x=>source.evolvesTo.includes(x.name));
 const b=g.players[1];b.owned=[source.id,...cards.filter(x=>x.bonus===source.evoCost.color&&x.id!==source.id).slice(0,source.evoCost.count).map(x=>x.id)];b.reserved=[next.id];
 g.phase='evolve';act(g,'b',{type:'evolve',from:source.id,to:next.id});
 assert.ok(b.owned.includes(next.id));assert.ok(b.tucked.includes(source.id));
});
