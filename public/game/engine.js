import {cards} from './cards.js';
import {DEFAULT_MODE} from './modes.js';
export {cards};
export const COLORS=['red','blue','black','pink','yellow'];
export const ALL=[...COLORS,'purple'];
export const names={red:'精灵球',blue:'超级球',black:'高级球',pink:'治愈球',yellow:'先机球',purple:'大师球'};
export const levels=['基础','一阶进化','二阶进化','稀有','传说'];
export const cardMap=Object.fromEntries(cards.map(c=>[c.id,c]));
export const zero=()=>Object.fromEntries(ALL.map(k=>[k,0]));
export const total=o=>Object.values(o).reduce((a,b)=>a+b,0);
export function ensure(condition,message){if(!condition)throw Error(message)}
function shuffle(list){for(let i=list.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}return list}
export function newGame(seats,practice=false,mode=DEFAULT_MODE){
 const decks=[1,2,3,4,5].map(t=>shuffle(cards.filter(c=>c.tier===t).map(c=>c.id)));
 const market=decks.map((d,i)=>d.splice(0,i<3?4:1));
 const order=practice?seats:shuffle([...seats]);
 return {mode,players:order.map(s=>({...s,balls:zero(),owned:[],reserved:[],tucked:[]})),decks,market,
 bank:{...Object.fromEntries(COLORS.map(k=>[k,[4,5,7][seats.length-2]])),purple:5},turn:0,round:1,phase:'main',finalRound:false,done:false,events:[],seq:0};
}
export function points(p){return p.owned.reduce((s,id)=>s+cardMap[id].points,0)}
export function bonuses(p){const o=zero();for(const id of p.owned){const c=cardMap[id];o[c.bonus]+=c.bonusCount}return o}
export function payment(p,c){
 const bonus=bonuses(p), spend=zero();spend.purple=c.cost.purple;
 for(const k of COLORS){const owed=Math.max(0,c.cost[k]-bonus[k]);spend[k]=Math.min(owed,p.balls[k]);spend.purple+=owed-spend[k]}
 return spend.purple<=p.balls.purple?spend:null;
}
export function evoOptions(g,p){const bonus=bonuses(p);const available=[...g.market.flat(),...p.reserved].filter(Boolean);
 return p.owned.flatMap(from=>{const c=cardMap[from];return c.evoCost&&bonus[c.evoCost.color]>=c.evoCost.count?available.filter(id=>c.evolvesTo.includes(cardMap[id].name)).map(to=>({from,to})):[]});
}
function note(g,p,type,msg){g.events.push({seq:++g.seq,player:p.id,type,msg});if(g.events.length>65)g.events.shift()}
function removeCard(g,p,id,allowReserved){ensure(typeof id==='string'&&cardMap[id],'找不到这张卡牌');
 if(allowReserved&&p.reserved.includes(id)){p.reserved.splice(p.reserved.indexOf(id),1);return}
 const t=cardMap[id].tier-1,i=g.market[t].indexOf(id);ensure(i>=0,'卡牌已经离开公共牌区');g.market[t][i]=g.decks[t].pop()??null;
}
function endTurn(g){const p=g.players[g.turn];if(points(p)>=18)g.finalRound=true;
 if(g.turn===g.players.length-1){if(g.finalRound){g.done=true;g.phase='done';note(g,p,'win','对局已结束');return}g.round++}
 g.turn=(g.turn+1)%g.players.length;g.phase='main';
}
function afterAction(g,p){if(total(p.balls)>10){g.phase='discard';return}
 if((g.mode==='expert'&&!p.bot)||evoOptions(g,p).length)g.phase='evolve';else endTurn(g);
}
function counts(input){ensure(input&&typeof input==='object'&&!Array.isArray(input),'请选择精灵球');
 ensure(Object.keys(input).every(k=>ALL.includes(k)),'精灵球颜色无效');
 const o=zero();for(const k of ALL){const n=input[k]??0;ensure(Number.isInteger(n)&&n>=0&&n<=10,'数量无效');o[k]=n}return o;
}
export function validTake(bank,choice){let n=total(choice);const avail=COLORS.filter(k=>bank[k]>0).length;
 if(choice.purple||COLORS.some(k=>choice[k]>bank[k]))return false;
 return (n===2&&COLORS.some(k=>choice[k]===2&&bank[k]>=4))||
 (n>=1&&n<=Math.min(3,avail)&&(avail<3||n===3)&&COLORS.every(k=>choice[k]<=1));
}
export function act(g,id,a){
 const p=g.players[g.turn];ensure(!g.done&&p.id===id,'请等待自己的回合');ensure(a&&typeof a.type==='string','行动无效');
 if(g.phase==='discard'){ensure(a.type==='discard','请先归还超出的精灵球');const back=counts(a.balls);
 ensure(total(back)===total(p.balls)-10&&ALL.every(k=>back[k]<=p.balls[k]),'请归还恰好超过上限的数量');
 for(const k of ALL){p.balls[k]-=back[k];g.bank[k]+=back[k]}note(g,p,'discard','归还了多余精灵球');afterAction(g,p);return}
 if(g.phase==='evolve'){if(a.type==='end'){endTurn(g);return}
 ensure(a.type==='evolve'&&evoOptions(g,p).some(e=>e.from===a.from&&e.to===a.to),'未达到本次进化条件');
 removeCard(g,p,a.to,true);p.owned.splice(p.owned.indexOf(a.from),1);p.tucked.push(a.from);p.owned.push(a.to);
 note(g,p,'evolve',cardMap[a.from].name+' 进化为 '+cardMap[a.to].name);endTurn(g);return}
 if(a.type==='take'){const picked=counts(a.balls);ensure(validTake(g.bank,picked),'请选择三种不同颜色，或从库存至少四个的一色中拿两个');
 for(const k of ALL){p.balls[k]+=picked[k];g.bank[k]-=picked[k]}note(g,p,'take','拿取了'+ALL.filter(k=>picked[k]).map(k=>names[k]+'×'+picked[k]).join('、'))}
 else if(a.type==='reserve'){ensure(p.reserved.length<3,'最多保留三张卡牌');let id=a.card;
 if(a.deck!==undefined){ensure(Number.isInteger(a.deck)&&a.deck>=0&&a.deck<3&&g.decks[a.deck].length,'这个牌堆无法保留');id=g.decks[a.deck].pop()}
 else{ensure(cardMap[id]?.tier<=3,'只能保留基础至二阶进化的卡牌');removeCard(g,p,id,false)}
 p.reserved.push(id);if(g.bank.purple){g.bank.purple--;p.balls.purple++}note(g,p,'reserve','保留了一张卡牌')}
 else if(a.type==='catch'){const c=cardMap[a.card];ensure(c,'卡牌不存在');const pay=payment(p,c);ensure(pay,'持有精灵球与永久奖励不足');removeCard(g,p,a.card,true);
 for(const k of ALL){p.balls[k]-=pay[k];g.bank[k]+=pay[k]}p.owned.push(a.card);note(g,p,'catch','捕捉了'+c.name)}
 else if(a.type==='pass'){ensure(!COLORS.some(k=>g.bank[k])&&p.reserved.length>=3&&![...g.market.flat(),...p.reserved].filter(Boolean).some(id=>payment(p,cardMap[id])),'仍有可执行的行动');note(g,p,'end','跳过了行动')}
 else throw Error('无法执行此操作');
 afterAction(g,p);
}
export function ranking(g){const value=p=>[points(p),p.tucked.length,p.owned.length];return [...g.players].sort((a,b)=>{const av=value(a),bv=value(b);return bv[0]-av[0]||bv[1]-av[1]||bv[2]-av[2]})}
export function botAction(g){
 const p=g.players[g.turn],visible=[...g.market.flat(),...p.reserved].filter(Boolean),bonus=bonuses(p);
 if(g.phase==='evolve'){const options=evoOptions(g,p).sort((a,b)=>cardMap[b.to].points-cardMap[a.to].points);return options.length?{type:'evolve',...options[0]}:{type:'end'}}
 if(g.phase==='discard'){const balls={...p.balls},back=zero();while(total(balls)>10){const k=COLORS.filter(k=>balls[k]>0).sort((a,b)=>balls[b]-balls[a])[0]??'purple';balls[k]--;back[k]++}return {type:'discard',balls:back}}
 const cost=id=>{const c=cardMap[id];return COLORS.reduce((s,k)=>s+Math.max(0,c.cost[k]-bonus[k]-p.balls[k]),0)+Math.max(0,c.cost.purple-p.balls.purple)};
 const targets=[...visible].sort((a,b)=>(cost(a)-cardMap[a].points*.45)-(cost(b)-cardMap[b].points*.45));
 const afford=visible.filter(id=>payment(p,cardMap[id])).sort((a,b)=>cardMap[b].points-cardMap[a].points||bonus[cardMap[a].bonus]-bonus[cardMap[b].bonus]);
 if(afford.length)return {type:'catch',card:afford[0]};
 const goal=cardMap[targets[0]],available=COLORS.filter(k=>g.bank[k]>0).sort((a,b)=>(Math.max(0,goal.cost[b]-bonus[b]-p.balls[b])-Math.max(0,goal.cost[a]-bonus[a]-p.balls[a]))||p.balls[a]-p.balls[b]);
 if(p.reserved.length<3&&g.bank.purple>0&&(total(p.balls)>=8||available.length<2||cost(goal.id)===1&&g.market.flat().includes(goal.id)&&goal.tier<=3)){let id=targets.find(id=>cardMap[id].tier<=3&&!p.reserved.includes(id));if(id)return {type:'reserve',card:id}}
 if(available.length){let k=available[0],balls=zero();if(goal.cost[k]-bonus[k]-p.balls[k]>=2&&g.bank[k]>=4)balls[k]=2;else available.slice(0,3).forEach(k=>balls[k]=1);return {type:'take',balls}}
 const reserve=visible.find(id=>!p.reserved.includes(id)&&cardMap[id].tier<=3);if(p.reserved.length<3&&reserve)return {type:'reserve',card:reserve};
 return {type:'pass'};
}
export function viewGame(g,viewer){if(!g)return null;return {...g,phase:!g.done&&g.players[g.turn].id!==viewer?'waiting':g.phase,decks:g.decks.map(d=>d.length),players:g.players.map(p=>({...p,reserved:p.id===viewer?p.reserved:p.reserved.map(()=>null),tucked:p.tucked.map(()=>null)}))}}
