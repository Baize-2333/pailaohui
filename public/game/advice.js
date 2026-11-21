import {ALL, COLORS, cardMap, names, bonuses, payment, evoOptions, points, total, zero, validTake} from './engine.js';

const labelBalls = counts => ALL.filter(k => counts[k]).map(k => names[k] + '×' + counts[k]).join('、');

function legalTakes(bank) {
  const available = COLORS.filter(k => bank[k] > 0);
  const choices = [];
  function pick(start, colors) {
    if (colors.length) {
      const balls = zero();
      colors.forEach(k => balls[k]++);
      if (validTake(bank, balls)) choices.push(balls);
    }
    if (colors.length < 3)
      for (let i = start; i < available.length; i++) pick(i + 1, [...colors, available[i]]);
  }
  pick(0, []);
  for (const k of available) {
    if (bank[k] >= 4) choices.push({...zero(), [k]: 2});
  }
  return choices;
}

function gap(cost, balls) {
  const short = COLORS.reduce((n,k) => n + Math.max(0, cost[k] - balls[k]), 0);
  return Math.max(0, short + cost.purple - balls.purple, cost.purple - balls.purple);
}

// Keep scarce resources for this target when a projected take exceeds the hand limit.
function returnsFor(cost, hand) {
  const balls = {...hand}, back = zero();
  while (total(balls) > 10) {
    const choices = ALL.filter(k => balls[k] > 0);
    choices.sort((a,b) => {
      const loss = k => gap(cost, {...balls, [k]: balls[k]-1});
      return loss(a)-loss(b) || Number(a==='purple')-Number(b==='purple') ||
        (balls[b]-cost[b])-(balls[a]-cost[a]);
    });
    const k = choices[0]; balls[k]--; back[k]++;
  }
  return back;
}

function planFor(card, table, player, bonus, takes, visible) {
  const cost = {...card.cost};
  for (const k of COLORS) cost[k] = Math.max(0,cost[k]-bonus[k]);
  const initial = {balls:player.balls, bank:table.bank, steps:[], gap:gap(cost,player.balls), locked:player.reserved.includes(card.id)};
  if (!initial.gap) return initial;
  // Search up to two preparation turns. Only visible cards and the supply can inform the search.
  let frontier = [initial], closest = initial;
  for (let depth=0; depth<2; depth++) {
    const next = new Map();
    for (const state of frontier) {
      const choices = (depth ? legalTakes(state.bank) : takes).map(balls => ({type:'take',balls}));
      if (state.bank.purple && player.reserved.length + state.steps.filter(x=>x.type==='reserve').length < 3) {
        const existing = new Set([...player.reserved, ...state.steps.map(x=>x.card)]);
        const reserve = card.tier<=3 && !existing.has(card.id) ? card.id :
          visible.find(id=>cardMap[id].tier<=3 && !existing.has(id));
        if (reserve) choices.push({type:'reserve',card:reserve,balls:{...zero(),purple:1}});
      }
      for (const choice of choices) {
        const balls={...state.balls}, bank={...state.bank};
        for (const k of ALL) { balls[k]+=choice.balls[k]; bank[k]-=choice.balls[k]; }
        const back=returnsFor(cost,balls);
        for (const k of ALL) { balls[k]-=back[k]; bank[k]+=back[k]; }
        const remaining=gap(cost,balls);
        if (remaining>=state.gap) continue;
        const candidate={balls,bank,gap:remaining,steps:[...state.steps,{...choice,back}],locked:state.locked||choice.card===card.id};
        const key=ALL.map(k=>balls[k]).join(',')+'|'+candidate.steps.filter(s=>s.type==='reserve').map(s=>s.card).join(',');
        if (!next.has(key)) next.set(key,candidate);
      }
    }
    if (!next.size) break;
    frontier=[...next.values()].sort((a,b)=>a.gap-b.gap || Number(b.locked)-Number(a.locked) || total(b.balls)-total(a.balls)).slice(0,5);
    if (frontier[0].gap < closest.gap) closest=frontier[0];
    if (!closest.gap) break;
  }
  return closest;
}

function targetValue(card, visible, player, bonus, plan) {
  const gain=card.bonusCount, color=card.bonus;
  const after={...player,owned:[...player.owned,card.id]};
  const forms=evoOptions({market:[visible.filter(id=>id!==card.id)]},{...after,reserved:[]});
  const bestForm=forms.sort((a,b)=>(cardMap[b.to].points-cardMap[b.from].points)-(cardMap[a.to].points-cardMap[a.from].points))[0];
  const evoGain=bestForm?cardMap[bestForm.to].points-cardMap[bestForm.from].points:0;
  const future=visible.filter(id=>id!==card.id&&cardMap[id].cost[color]>bonus[color]).length;
  const score=(points(player)+card.points+evoGain>=18?20:0)+2.4*(card.points+evoGain)+gain*.55+Math.min(6,future)*.15-
    plan.steps.length*2.8-plan.gap*5+(plan.locked ? .15 : 0);
  return {score,bestForm};
}

function stepText(step) {
  const move=step.type==='reserve'?'保留'+cardMap[step.card].name+'，领取 1 个大师球':'取'+labelBalls(step.balls);
  return move+(total(step.back)?'，随后归还'+labelBalls(step.back):'');
}

function coach(table, player, visible, options, phase) {
  if (phase==='evolve') {
    const e=[...options].sort((a,b)=>(cardMap[b.to].points-cardMap[b.from].points)-(cardMap[a.to].points-cardMap[a.from].points))[0];
    if(!e)return null;
    const source=cardMap[e.from],target=cardMap[e.to],condition=source.evoCost;
    return {targetId:target.id,title:source.name+'进化为'+target.name,steps:['选中这组进化，完成本回合。','替换后净增 '+(target.points-source.points)+' 分，并获得'+names[target.bonus]+'奖励。'],
      reason:'你已有 '+bonuses(player)[condition.color]+' 个'+names[condition.color]+'永久奖励，达到进化所需的 '+condition.count+' 个。'};
  }
  const bonus=bonuses(player),takes=legalTakes(table.bank);
  let best=null;
  for(const id of visible) {
    const card=cardMap[id], plan=planFor(card,table,player,bonus,takes,visible);
    const value=targetValue(card,visible,player,bonus,plan);
    if(table.finalRound && (plan.steps.length || plan.gap)) value.score-=100;
    if(!best || value.score>best.score)best={card,plan,...value};
  }
  if(!best)return {title:'查看精灵球供应',steps:['从供应区选择一个合法的拿球组合，或从普通牌堆盲抽保留。'],reason:'公共区或你的保留区出现新牌后，路线会重新计算。'};
  const {card,plan,bestForm}=best;
  const remainingCost={...card.cost};
  for(const k of COLORS) remainingCost[k]=Math.max(0,card.cost[k]-bonus[k]);
  if (phase==='discard') {
    const back=returnsFor(remainingCost,player.balls);
    return {title:'为'+card.name+'留球',steps:['归还'+labelBalls(back)+'，将手球减至 10 个。','保留目标牌需要的颜色，完成归还后再检查进化。'],reason:'当前持有 '+total(player.balls)+' 个精灵球。'};
  }
  if(table.finalRound && (plan.steps.length || plan.gap)) {
    const e=options[0];
    return {title:'把握最后一次行动',steps:[e?'先完成主行动，再进化'+cardMap[e.from].name+'为'+cardMap[e.to].name+'。':'检查可以保留或拿取的资源，完成最后一次行动。'],reason:'按当前资源，你没有能够立即捕捉的目标。终局只计算正面宝可梦的分数。'};
  }
  const steps=plan.steps.map(stepText);
  if(!plan.gap) {
    const pay=payment({...player,balls:plan.balls},card);
    steps.push('捕捉'+card.name+(pay&&total(pay)?'，支付'+labelBalls(pay):'，由永久奖励抵清费用')+'。');
    if(bestForm)steps.push('本回合结束时，可将'+cardMap[bestForm.from].name+'进化为'+cardMap[bestForm.to].name+'。');
  } else {
    if(!steps.length)steps.push('先考虑其他可捕捉的牌，或保留一张普通牌等待补球。');
    steps.push('等供应或永久奖励变化，再补足'+card.name+'的费用。');
  }
  const immediateEvolution=plan.steps.length&&options[0];
  if (immediateEvolution) steps.splice(1,0,'首个行动结束时，可先让'+cardMap[immediateEvolution.from].name+'进化为'+cardMap[immediateEvolution.to].name+'。选择进化后，后续路线将重算。');
  const reason='这张牌值 '+card.points+' 分，提供'+names[card.bonus]+'永久奖励 ×'+card.bonusCount+'。';
  return {targetId:card.id,title:'目标 · '+card.name,steps,reason:reason+(steps.length>1?' 后续步骤按当前牌区估算，牌面变化后会重算。':'')};
}

export function personalHints(game,viewer,mode) {
  if(!game || game.done || mode==='expert') return null;
  const player=game.players.find(p=>p.id===viewer);
  if(!player) return null;
  const table={bank:game.bank,market:game.market,finalRound:game.finalRound};
  const visible=[...table.market.flat(),...player.reserved].filter(Boolean);
  const options=evoOptions(table,player);
  const status={};
  for(const id of visible) {
    status[id]={affordable:!!payment(player,cardMap[id]),evolution:options.some(e=>e.to===id)?'进化目标':null};
  }
  const bonus=bonuses(player);
  for(const id of player.owned){
    const c=cardMap[id];if(!c.evoCost)continue;
    const missing=c.evoCost.count-bonus[c.evoCost.color];
    status[id]={evolution:options.some(e=>e.from===id)?'可进化':missing>0?'还差 '+missing+' 个奖励':'等待进化牌'};
  }
  const phase=game.players[game.turn].id===viewer?game.phase:'waiting';
  let route=null;
  if (mode==='beginner' && !(game.finalRound && game.players.indexOf(player)<game.turn)) {
    route=coach(table,player,visible,options,phase);
    if (route?.targetId && status[route.targetId]) status[route.targetId].routeGoal=true;
  }
  return {status,route};
}
