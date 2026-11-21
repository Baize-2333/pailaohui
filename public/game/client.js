import {clubFetch} from './network.js';
import {ALL,COLORS,cards,cardMap,names,levels,zero,total,points,bonuses,payment,evoOptions,validTake,ranking} from './engine.js';
import {icon,esc,sprite,ball,chips,cardTile,blockTitle,guideRows,rulesHtml} from './ui.js';
import {playAudio,initAudio} from './audio.js';
import {DEFAULT_MODE,modes} from './modes.js';
import {personalHints} from './advice.js';
const $=s=>document.querySelector(s), root=$('#club'), layers=$('#layers');
const local=(k,f)=>{try{return JSON.parse(localStorage.getItem('kc.'+k))??f}catch{return f}};
const save=(k,v)=>localStorage.setItem('kc.'+k,JSON.stringify(v));
const randomToken=()=>crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(22)),n=>n.toString(16).padStart(2,'0')).join('');
const token=local('seat',null)||randomToken();save('seat',token);
let profile=local('profile',{name:'训练师',avatar:25}), sound=local('sound',true),open=false,room=null,rooms=[],screen='lobby',filter='all',pending=false,polling=false,tierFilter=0,search='',modal='',needsRefresh=false,chosen=zero(),lastNetError='',prevGame=null;
let invite=new URL(location.href).searchParams.get('room')?.toUpperCase()||'';
const btn=(act,k,label,cl='sub',extra='')=>'<button type="button" class="btn '+cl+'" data-act="'+act+'" '+extra+'>'+icon(k,17)+label+'</button>';
const icoBtn=(act,k,label)=>'<button class="icon-btn" data-act="'+act+'" title="'+esc(label)+'" aria-label="'+esc(label)+'">'+icon(k)+'</button>';
const roomMode=r=>modes[r?.mode]??modes[DEFAULT_MODE];
let hintKey='',hintValue=null,detailCard='';
function hintsFor(r){
 const key=[r.code,r.rev,r.you,r.mode].join(':');
 if(key!==hintKey){hintValue=personalHints(r.game,r.you,r.mode??DEFAULT_MODE);hintKey=key}
 return hintValue;
}
function modePicker(){
 return '<fieldset class="mode-picker"><legend>房间模式</legend>'+Object.entries(modes).map(([id,mode])=>
 '<label><input type="radio" name="mode" value="'+id+'" '+(id===DEFAULT_MODE?'checked':'')+'><span><b>'+mode.name+'</b><small>'+mode.description+'</small></span></label>').join('')+
 '<p>全桌使用同一模式，提示仅在各自的屏幕显示。</p></fieldset>';
}
function routePanel(route,mine){
 if(!route)return '';
 return '<section class="panel coach">'+blockTitle('spark','AI 路线指导','','<span class="private-note">'+icon('lock',13)+'仅自己可见</span>')+
 '<div class="coach-body"><h3>'+esc(route.title)+'</h3><p>'+esc(route.reason)+'</p><ol>'+route.steps.map(step=>'<li>'+esc(step)+'</li>').join('')+'</ol>'+
 (!mine?'<small>下回合预案 · 轮到你时会按最新牌面更新</small>':'')+'</div></section>';
}
function expertEvolution(game,player){
 function list(ids){return ids.filter(Boolean).map(id=>'<option value="'+id+'">'+esc(cardMap[id].name)+' · '+id+'</option>').join('')}
 return '<form class="manual-evolution" data-form="manual-evolve">'+formField('原形态','<select required name="from"><option value="">选择已捕捉的卡</option>'+list(player.owned)+'</select>')+
 formField('目标形态','<select required name="to"><option value="">选择公共区或保留区的卡</option>'+list([...game.market.flat(),...player.reserved])+'</select>')+
 '<div class="actions"><button type="submit" class="btn sub">执行进化</button>'+btn('end','check','结束回合')+'</div></form>';
}
const statusLabel={waiting:'等待加入',playing:'对局中',ended:'已结算'};
const titleOf={lobby:'游戏大厅',album:'卡牌图鉴',rules:'玩法指南'};
const navItem=(s,k)=>'<button data-act="nav" data-id="'+s+'" class="nav-item '+(screen===s?'sel':'')+'">'+icon(k,17)+titleOf[s]+'</button>';
const logo='<span class="brandmark"><i></i></span><span class="brandtxt"><strong>牌老汇·群友是㊗️</strong><small>宝可梦桌游</small></span>';
function header(){return '<header class="top"><div class="topin"><button data-act="home" class="brand">'+logo+'</button><nav>'+navItem('lobby','lobby')+navItem('album','cards')+navItem('rules','book')+'</nav><div class="toptools">'+icoBtn('sound',sound?'volume':'mute',sound?'关闭音效':'开启音效')+'<button class="avatar" data-act="profile" title="训练师资料" aria-label="训练师资料">'+sprite(profile.avatar)+'</button></div></div></header>'}
function hero(){return '<section class="hero"><div class="hero-scene"></div><div class="hero-shade"></div><div class="stars"><i>✦</i><i>✧</i><i>✧</i></div>'+sprite(6,'hero-char')+sprite(25,'hero-pika')+sprite(133,'hero-eevee')+'<div class="hero-content"><span class="edition">'+icon('gem',14)+'经典桌游 · 基础版</span><h1>宝可梦<span>璀璨宝石</span></h1><p>收集精灵球，进化宝可梦，成为关都最出色的训练师。</p><div class="hero-meta"><span>'+icon('users',15)+'2–4 人</span><span>'+icon('clock',15)+'约 30 分钟</span><span>'+icon('trophy',15)+'18 分决胜</span></div><div class="hero-actions">'+(open?btn('create','plus','创建房间','gold-btn')+btn('join','key','房间号加入','glass'):btn('focus-pass','key','进入游戏大厅','gold-btn')+btn('rules','book','查看规则','glass'))+'</div></div><span class="hero-stamp"><i></i>KANTO REGION</span></section>'}
function guide(){return '<aside class="panel guide">'+blockTitle('book','玩法速览','QUICK GUIDE')+'<div class="guide-body">'+guideRows+'</div><button class="guide-more" data-act="rules">'+icon('book',16)+'查看完整规则'+icon('chev',15)+'</button></aside>'}
function gatePanel(){return '<section class="panel entrance">'+blockTitle('lock','大厅入口','CLUB ACCESS')+'<div class="gate-body"><div class="gate-desc"><div class="slotart"><span class="orbit"></span>'+sprite(52)+'</div><div><h3>欢迎来到牌老汇·群友是㊗️</h3><p>输入共享通行密码，就能与好友同桌游玩。</p></div></div><form data-form="access"><label for="pass">通行密码</label><div class="input-with">'+icon('key',18)+'<input id="pass" name="password" type="password" maxlength="128" autocomplete="current-password" placeholder="输入俱乐部密码" required/><button type="button" data-act="eye" class="bare" aria-label="显示或隐藏密码">'+icon('eye',18)+'</button></div><div class="form-error" role="alert"></div><button class="btn purple-btn" type="submit">'+icon('game')+'进入大厅</button></form></div></section>'}
function roomList(){const shown=rooms.filter(r=>filter==='all'||r.status===filter);return '<section class="panel rooms">'+blockTitle('lobby','房间广场','ROOMS',icoBtn('refresh','refresh','刷新房间列表'))+'<div class="filters">'+[['all','全部房间'],['waiting','等待中'],['playing','游戏中']].map(([k,v])=>'<button data-act="filter" data-id="'+k+'" class="'+(filter===k?'active':'')+'">'+v+'</button>').join('')+'</div><div class="room-list">'+(lastNetError?'<div class="empty"><b>房间列表暂未同步</b><p>'+esc(lastNetError)+'</p>'+btn('refresh','refresh','重试')+'</div>':shown.length?shown.map(r=>'<div class="roomrow"><div class="seatmini">'+sprite(r.avatar)+'</div><div><strong>'+esc(r.title)+'</strong><small>'+esc(r.host)+' · '+r.count+' / '+r.capacity+' 人 · '+roomMode(r).name+'模式</small></div><span class="state '+r.status+'">'+statusLabel[r.status]+'</span><button class="join-row" data-act="join-code" data-id="'+r.code+'" '+(r.status!=='waiting'||r.count>=r.capacity?'disabled':'')+'>加入</button></div>').join(''):'<div class="empty"><div class="pixel-ball">'+ball('purple')+'</div><b>'+(filter==='all'?'还没有公开房间':'暂无符合条件的房间')+'</b><p>创建一间房，邀请好友开启第一局。</p>'+btn('create','plus','创建房间','link-btn')+'</div>')+'</div></section>'}
function lobby(){return hero()+'<div class="lobby-grid">'+(open?roomList():gatePanel())+guide()+'</div>'}
function album(){const items=cards.filter(c=>(!tierFilter||c.tier===tierFilter)&&(!search||c.name.includes(search)));return '<section class="pagehead"><span class="eyebrow">CARD INDEX</span><h1>卡牌图鉴</h1><p>基础版全部 90 张卡牌，点击查看捕捉费用与进化条件。</p></section><div class="panel album-panel"><div class="album-bar"><div class="filters">'+['全部',...levels].map((k,i)=>'<button data-act="tier" data-id="'+i+'" class="'+(tierFilter===i?'active':'')+'">'+k+'</button>').join('')+'</div><label class="input-with">'+icon('search')+'<input name="search" placeholder="搜索宝可梦" value="'+esc(search)+'"></label></div><div class="albumgrid">'+items.map(c=>cardTile(c.id)).join('')+(items.length?'':'<p>没有匹配的宝可梦。</p>')+'</div></div>'}
function formField(label,field){return '<label class="field">'+label+field+'</label>'}
function footer(){return '<footer><div class="foot-left">'+icon('gem',16)+'牌老汇·群友是㊗️ <span>／</span> 宝可梦桌游</div><small>宝可梦主题非官方同人桌游</small></footer>'}
function draw(){
 const yy=window.scrollY;
 root.innerHTML=header()+'<div class="container">'+(screen==='album'?album():screen==='rules'?'<section class="pagehead"><span class="eyebrow">RULEBOOK</span><h1>玩法指南</h1></section><div class="panel fullrules">'+rulesHtml+'</div>':room?room.status==='waiting'?waiting():board():lobby())+footer()+'</div>';
 if(yy>0)window.scrollTo(0,yy);
}
function waiting(){const me=room.seats.find(s=>s.id===room.you),host=room.hostId===room.you,ready=room.seats.length>=2&&room.seats.every(s=>s.ready);return '<div class="pagehead"><span class="eyebrow">TRAINER ROOM</span><h1>'+esc(room.title)+'</h1><p><b class="mode-tag">'+roomMode(room).name+'模式</b> 入座后点击准备，房主即可开始对局。</p></div><div class="lobby-grid"><section class="panel">'+blockTitle('users','等待入座','PLAYERS','<span class="state waiting">'+room.count+' / '+room.capacity+' 人</span>')+'<div class="waitbody"><div class="invitebox"><div><small>房间号</small><b>'+room.code+'</b></div>'+btn('copy','copy','复制邀请链接')+'</div><div class="seats">'+Array.from({length:room.capacity},(_,i)=>{const s=room.seats[i];return s?'<div class="seat">'+sprite(s.avatar)+'<div><b>'+esc(s.name)+(s.id===room.you?'（你）':'')+'</b><small>'+(s.id===room.hostId?'房主':s.bot?'电脑训练师':'训练师')+' · '+(s.ready?'已准备':'未准备')+'</small></div>'+(host&&s.id!==room.hostId?'<button data-act="remove" data-id="'+s.id+'" class="bare" title="移出座位">'+icon('close',16)+'</button>':'')+'</div>':'<div class="seat free">'+icon('users',25)+'<span>空闲座位</span></div>'}).join('')+'</div><div class="actions">'+(host?btn('start','game','开始游戏','gold-btn',ready?'':'disabled')+(room.count<room.capacity?btn('bot','plus','添加电脑'): ''):btn('ready','check',me.ready?'取消准备':'准备就绪',me.ready?'sub':'gold-btn'))+(host?btn('dissolve-confirm','exit','解散房间','quiet'):btn('leave','exit','离开房间','quiet'))+'</div></div></section>'+chatPanel()+'</div>'}
function chatPanel(){return '<aside class="panel">'+blockTitle('log','房间聊天','CHAT')+'<div class="chatlog">'+(room.chat.map(x=>'<p><b>'+esc(x.name)+'</b> '+esc(x.msg)+'</p>').join('')||'<p class="muted">还没有消息。</p>')+'</div><form class="chat-form" data-form="chat"><input name="text" maxlength="160" placeholder="和同桌打个招呼" aria-label="聊天内容" required><button class="btn sub" type="submit">发送</button></form></aside>'}
function ballsRow(bank,action,select){return '<div class="balls-row">'+ALL.map(k=>'<button class="ballcol '+(select?.[k]?'picked':'')+'" data-act="'+action+'" data-id="'+k+'" '+((action==='choose'&&k==='purple')||((action==='choose'||action==='give')&&!bank[k])?'disabled':'')+' aria-label="'+names[k]+'，剩余 '+bank[k]+'"><span>'+ball(k)+'</span><b>'+names[k]+'</b><small>× '+bank[k]+(select?.[k]?' <em>选 '+select[k]+'</em>':'')+'</small></button>').join('')+'</div>'}
function board(){
 const g=room.game;if(!g)return '';const p=g.players.find(s=>s.id===room.you),cur=g.players[g.turn],mine=!g.done&&p.id===cur.id;
 const expert=room.mode==='expert',beginner=room.mode==='beginner',hints=hintsFor(room);
 const tile=id=>cardTile(id,'detail',hints?.status[id]);
 const prompt=g.done?'本局已结算':!mine?'等待 '+cur.name+' 行动':g.phase==='main'?(beginner?'轮到你了，拿球、捕捉或保留一张卡':'轮到你行动了'):g.phase==='discard'?'请选择要归还的精灵球':expert?'结束阶段':'你可以进化一只宝可梦';
 
 return '<div class="board-head"><div><span class="eyebrow">GAME TABLE · '+room.code+' <b class="mode-tag">'+roomMode(room).name+'模式</b></span><h1>'+esc(room.title)+'</h1></div><div class="actions">'+btn('board-info','log','记录与聊天')+btn('rules','book','规则')+(!g.done?(room.hostId===room.you?btn('dissolve-confirm','exit','解散房间','quiet'):icoBtn('retire-confirm','exit','退出并交由电脑接管')):'')+'</div></div><div class="turnbar '+(mine?'my-turn':'')+'"><span>'+icon('clock')+'第 '+g.round+' 轮</span><b>'+esc(prompt)+'</b>'+(g.finalRound?'<em>最后一轮</em>':'')+'</div>'+
 (g.done?resultPanel(g):routePanel(hints?.route,mine))+'<div class="scoreboard">'+g.players.map(pl=>'<button data-act="team" data-id="'+pl.id+'" class="score '+(pl.id===cur.id&&!g.done?'current':'')+'">'+sprite(pl.avatar)+'<div><strong>'+esc(pl.name)+(pl.id===p.id?' · 你':'')+'</strong><small>'+pl.owned.length+' 张宝可梦 · '+total(pl.balls)+' 个球</small></div><b>'+points(pl)+'<small> 分</small></b></button>').join('')+'</div>'+
 '<section class="panel bank">'+blockTitle('ball',g.phase==='discard'&&mine?'归还多余精灵球':'精灵球供应区','SUPPLY',mine&&g.phase==='main'&&beginner?'<span class="muted mini">点击选择，再次点击可取同色</span>':'')+
 ballsRow(g.phase==='discard'&&mine?p.balls:g.bank,mine&&g.phase==='main'?'choose':mine&&g.phase==='discard'?'give':'noop',chosen)+
 (mine&&['main','discard'].includes(g.phase)?'<div class="ball-actions"><span>已选 '+total(chosen)+' 个'+(g.phase==='discard'?'，需归还 '+(total(p.balls)-10)+' 个':'')+'</span>'+btn('clear','refresh','清空','quiet')+btn('confirm-balls','check',g.phase==='discard'?'确认归还':'确认取球','purple-btn',(g.phase==='discard'?total(chosen)===total(p.balls)-10:validTake(g.bank,chosen))?'':'disabled')+'</div>':'')+
 (mine&&g.phase==='evolve'?(expert?expertEvolution(g,p):'<div class="evochoices">'+evoOptions(g,p).map(e=>btn('evolve','spark',esc(cardMap[e.from].name)+' → '+esc(cardMap[e.to].name),'purple-btn','data-from="'+e.from+'" data-id="'+e.to+'"')).join('')+btn('end','check','跳过进化')+'</div>'):'')+'</section>'+
 '<section class="panel market">'+blockTitle('layers','公共牌区','MARKET')+g.market.map((row,t)=>'<div class="market-row"><div class="deck-name"><small>'+['LEVEL I','LEVEL II','LEVEL III','RARE','LEGEND'][t]+'</small><b>'+levels[t]+'</b><span>余 '+g.decks[t]+' 张</span>'+(mine&&g.phase==='main'&&t<3&&g.decks[t]&&p.reserved.length<3?'<button data-act="blind" data-id="'+t+'">盲抽保留</button>':'')+'</div><div class="market-cards">'+row.map(tile).join('')+'</div></div>').join('')+'</section>'+
 '<section class="panel hand">'+blockTitle('cards','我的训练区','TRAINER')+'<div class="handbody"><h3>持有精灵球</h3><div class="resources">'+chips(p.balls).replace('免费','暂无')+'</div><h3>永久奖励</h3><div class="resources">'+chips(bonuses(p)).replace('免费','暂无')+'</div><h3>保留卡牌 · '+p.reserved.length+' / 3</h3><div class="albumgrid">'+p.reserved.map(tile).join('')+'</div><h3>已捕捉 · '+p.owned.length+'</h3><div class="albumgrid">'+p.owned.map(tile).join('')+'</div></div></section>';
}
function resultPanel(g){const r=ranking(g),top=r[0],wins=r.filter(p=>points(p)===points(top)&&p.tucked.length===top.tucked.length&&p.owned.length===top.owned.length);return '<div class="result">'+icon('trophy',32)+'<h2>'+wins.map(p=>esc(p.name)).join('、')+' 获胜</h2><p>'+r.map(p=>esc(p.name)+' '+points(p)+' 分').join('　·　')+'</p><div class="actions">'+(room.hostId===room.you?btn('rematch','refresh','再来一局','gold-btn'):'')+(room.hostId===room.you?btn('dissolve-confirm','lobby','解散并返回大厅'):btn('return','lobby','返回大厅'))+'</div></div>'}
function toast(msg){const div=document.createElement('div');div.className='toast';div.textContent=msg;$('#notices').append(div);setTimeout(()=>div.remove(),3000)}
function effect(type,event,g){const d=document.createElement('div');d.className='fx fx-'+type;
 const label=document.createElement('strong');label.className='fx-label';
 if(type==='take'){label.innerHTML=ALL.filter(k=>event.msg.includes(names[k])).map(k=>ball(k)).join('')}
 if(type==='reserve'){label.innerHTML=ball('purple')}
 if(type==='catch'||type==='evolve'){const who=g.players.find(s=>s.id===event.player),id=who?.owned?.at(-1);if(id){label.innerHTML=sprite(cardMap[id].dex)+'<span>'+esc(event.msg)+'</span>'}}
 if(label.innerHTML)d.append(label);
 for(let i=0;i<9;i++){let s=document.createElement('i');s.style.setProperty('--i',i);d.append(s)}document.body.append(d);setTimeout(()=>d.remove(),850)}
function receive(r){
 if(!r?.code)return;restoreCode='';const old=room?.code===r.code?room:null;if(old&&r.rev<old.rev)return;room=r;save('room',r.code);
 if(old&&old.rev!==r.rev&&r.game){const before=old.game;const e=r.game.events.filter(x=>x.seq>(before?.seq||0)&&x.player===r.you).at(-1)||r.game.events.filter(x=>x.seq>(before?.seq||0)).at(-1);
 if(e){playAudio(e.type,sound);effect(e.type,e,r.game)}else if(before?.turn!==r.game.turn)playAudio('turn',sound);if(before?.turn!==r.game.turn&&r.game.players[r.game.turn].id===r.you&&!r.game.done){playAudio('turn',sound);toast('轮到你行动了')}
 if(before?.turn!==r.game.turn||before?.phase!==r.game.phase)chosen=zero()}
 if(!old||r.rev!==old.rev){if(modal==='board-info'){if(document.activeElement?.name==='text'){needsRefresh=true;return}boardInfo()}if(modal==='detail'&&detailCard)detail(detailCard);if(!modal&&document.activeElement?.matches('input[name=text]')){needsRefresh=true;return}draw()}
}
async function api(data=null,params=''){
 const res=await clubFetch('/api/table'+params,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store'});const value=await res.json().catch(()=>({error:'服务器暂时未响应'}));
 if(!res.ok){if(res.status===401){open=false;room=null;closeModal();draw()}const err=Error(value.error||'请求失败');err.status=res.status;throw err}return value;
}
let listRequest=0,lastBackgroundPoll=0,restoreCode='';
async function listRooms(){
 const request=++listRequest;
 try{const data=await api();if(request!==listRequest)return;rooms=data.rooms;lastNetError=''}
 catch(e){if(request!==listRequest)return;lastNetError=e.message}
 if(!room&&screen==='lobby'&&!modal&&open)draw();
}
function clearRoom(code){
 room=null;restoreCode='';chosen=zero();hintKey='';hintValue=null;detailCard='';needsRefresh=false;
 if(local('room',null)===code)save('room',null);
 const url=new URL(location.href);
 if(url.searchParams.has('room')){url.searchParams.delete('room');history.replaceState(null,'',url.href)}
 invite='';rooms=rooms.filter(r=>r.code!==code);listRequest++;screen='lobby';closeModal();draw();
}
async function roomError(error,code){
 if(room?.code!==code)return;
 if(error.status===403||error.status===404){clearRoom(code);toast(error.message);await listRooms()}
 else toast(error.message);
}
async function refresh(){
 if(!open||polling||pending)return;
 if(document.hidden){
  if(!room||room.hostId!==room.you||Date.now()-lastBackgroundPoll<20000)return;
  lastBackgroundPoll=Date.now();
 }
 polling=true;const code=room?.code;
 try{
  if(code){const r=await api(null,'?room='+code);if(room?.code===code)receive(r)}
  else if(restoreCode)await restoreRoom(restoreCode);
  else if(!modal)await listRooms();
 }catch(e){
  if(code&&room?.code===code){
   if(e.status===403||e.status===404)await roomError(e,code);
   else lastNetError=e.message;
  }
 }finally{polling=false}
}
function closeModal(){layers.innerHTML='';modal='';document.body.classList.remove('modal-open')}
function dialog(kind,title,body){modal=kind;layers.innerHTML='<div class="backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="dialog-title"><h2>'+esc(title)+'</h2>'+icoBtn('dismiss','close','关闭')+'</div>'+body+'</section></div>';document.body.classList.add('modal-open');layers.querySelector('input,button')?.focus({preventScroll:true})}
function errors(msg){const e=document.querySelector('#layers .form-error')||document.querySelector('.form-error');if(e)e.textContent=msg;else toast(msg)}
function formModal(kind){if(!open){jumpPass();return}const create=kind==='create';dialog(kind,create?'创建房间':'通过房间号加入','<form data-form="'+kind+'">'+formField('训练师昵称','<input name="name" required maxlength="14" value="'+esc(profile.name)+'">')+(create?formField('房间名称','<input name="title" required maxlength="24" placeholder="例如：常青森林的周末桌" value="'+esc(profile.name)+'的房间">')+formField('座位数','<select name="capacity"><option value="2">2 人</option><option value="3">3 人</option><option selected value="4">4 人</option></select>')+modePicker()+'<label class="checkline"><input type="checkbox" name="listed" checked> 在房间广场展示</label>':formField('六位房间号','<input name="code" required maxlength="6" autocapitalize="characters" autocomplete="off" value="'+esc(invite)+'" placeholder="例如 AB3C8K">'))+'<div class="form-error" role="alert"></div><button type="submit" class="btn purple-btn">'+icon(create?'plus':'key')+(create?'创建房间':'加入房间')+'</button></form>')}
function jumpPass(){screen='lobby';draw();$('#pass')?.focus();$('#pass')?.scrollIntoView({block:'center',behavior:'smooth'})}
function detail(id){detailCard=id;const expert=room?.mode==='expert';const c=cardMap[id];if(!c)return;const g=room?.game,p=g?.players.find(s=>s.id===room.you),active=screen==='lobby'&&g&&!g.done&&g.players[g.turn].id===room.you&&g.phase==='main',publicCard=g?.market.flat().includes(id),own=p?.reserved.includes(id),pay=p&&!expert?payment(p,c):null;
 dialog('detail',c.name,'<div class="detail"><div class="detail-art c-'+c.bonus+'">'+sprite(c.dex)+'</div><div class="detail-line"><b>'+levels[c.tier-1]+'</b><span>'+c.points+' 分 · 图鉴 #'+String(c.dex).padStart(3,'0')+'</span></div><dl><dt>捕捉费用</dt><dd>'+chips(c.cost)+'</dd><dt>永久奖励</dt><dd>'+ball(c.bonus)+' × '+c.bonusCount+'</dd>'+(c.evoCost?'<dt>可进化为</dt><dd>'+esc(c.evolvesTo.join('、'))+'（'+names[c.evoCost.color]+'奖励 × '+c.evoCost.count+'）</dd>':'')+(!expert&&active&&(publicCard||own)?'<dt>当前支付</dt><dd>'+(pay?chips(pay):'精灵球或永久奖励不足')+'</dd>':'')+'</dl><div class="actions">'+(active&&(publicCard||own)?btn('catch','ball','捕捉','gold-btn','data-id="'+id+'" '+((expert||pay)?'':'disabled')):'')+(active&&publicCard&&c.tier<=3?btn('reserve','cards','保留卡牌','sub','data-id="'+id+'" '+(p.reserved.length<3?'':'disabled')):'')+'</div></div>')}
async function adjust(kind,extra={}){
 if(pending||!room)return;
 const code=room.code;pending=true;
 try{
  const data=await api({kind,code,rev:room.rev,...extra});
  if(room?.code!==code)return;
  if(data.left){clearRoom(code);await listRooms();return}
  closeModal();chosen=zero();receive(data);draw();
 }catch(e){
  if(e.status===409&&room?.code===code){
   try{const fresh=await api(null,'?room='+code);if(room?.code===code){closeModal();receive(fresh);draw();toast(e.message)}}
   catch(next){await roomError(next,code)}
  }else await roomError(e,code);
 }finally{pending=false}
}
async function joinCode(code){if(!open){jumpPass();return}if(pending)return;pending=true;try{const r=await api({kind:'join',code:code.trim().toUpperCase(),...profile});closeModal();screen='lobby';receive(r)}catch(e){if(modal)errors(e.message);else toast(e.message)}finally{pending=false}}
function preferences(){dialog('profile','训练师资料','<form data-form="profile">'+formField('昵称','<input name="name" value="'+esc(profile.name)+'" maxlength="14" required>')+'<label>伙伴头像</label><div class="avatarpick">'+[25,1,4,7,39,54,94,133,143].map(id=>'<label><input type="radio" name="avatar" value="'+id+'" '+(profile.avatar===id?'checked':'')+'>'+sprite(id)+'</label>').join('')+'</div><button class="btn purple-btn" type="submit">保存资料</button></form>')}
function team(id){const s=room.game.players.find(p=>p.id===id);dialog('team',s.name+'的训练区','<p>得分 '+points(s)+' · 进化 '+s.tucked.length+' 次 · 保留 '+s.reserved.length+' 张</p><h3>精灵球</h3>'+chips(s.balls).replace('免费','暂无')+'<h3>永久奖励</h3>'+chips(bonuses(s)).replace('免费','暂无')+'<h3>已捕捉的宝可梦</h3><p>'+s.owned.map(id=>esc(cardMap[id].name)).join('、')+'</p>')}
function boardInfo(){const g=room.game;dialog('board-info','对局记录与聊天','<div class="logs">'+g.events.slice(-12).reverse().map(e=>'<p>'+esc(g.players.find(p=>p.id===e.player)?.name)+' · '+esc(e.msg)+'</p>').join('')+'</div>'+chatPanel())}
function navigate(to){closeModal();screen=to;draw();window.scrollTo(0,0)}
async function restoreRoom(code){
 try{
  const r=await api(null,'?room='+encodeURIComponent(code));
  if(restoreCode===code&&!room)receive(r);
 }catch(e){
  if(restoreCode!==code||room)return;
  if(e.status===403&&invite){
   restoreCode='';await joinCode(code);if(!room)await listRooms();return;
  }
  if(e.status===403||e.status===404){clearRoom(code);toast(e.message);await listRooms()}
  else {lastNetError=e.message;if(!modal)draw()}
 }
}
async function unlocked(){
 open=true;draw();restoreCode=invite||local('room',null)||'';
 if(restoreCode)await refresh();else await listRooms();
}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-act]');if(!el){if(e.target.classList.contains('backdrop'))closeModal();return}const a=el.dataset.act,id=el.dataset.id;initAudio();
 if(a==='noop')return;if(a==='sound'){sound=!sound;save('sound',sound);playAudio('tap',sound);draw();return}playAudio('tap',sound);
 if(a==='nav'||a==='home')return navigate(a==='home'?'lobby':id);
 if(a==='profile')return preferences();if(a==='focus-pass')return jumpPass();if(a==='rules')return dialog('rules','玩法指南',rulesHtml);if(a==='dismiss')return closeModal();if(a==='eye'){const inp=$('#pass');inp.type=inp.type==='password'?'text':'password';return}
 if(a==='create'||a==='join')return formModal(a);if(a==='join-code')return joinCode(id);
 if(a==='filter'){filter=id;draw();return}if(a==='tier'){tierFilter=Number(id);draw();return}if(a==='refresh'){await listRooms();toast(lastNetError||'已刷新房间列表');return}
 if(a==='detail')return detail(id);if(!room)return;
 if(a==='dissolve-confirm')return dialog('dissolve','解散房间？','<p>所有玩家都会返回大厅，原邀请链接将失效。</p><div class="actions">'+btn('dissolve','exit','确认解散','purple-btn')+btn('dismiss','close','留在房间')+'</div>');
 if(a==='dissolve')return adjust('dissolve');
 if(a==='retire-confirm')return dialog('retire','退出本局','<p>你的座位将由电脑接管，其他训练师可以继续对局。</p><div class="actions">'+btn('retire','exit','退出并托管','purple-btn')+btn('dismiss','close','继续游玩')+'</div>');if(a==='retire')return adjust('retire');
 if(a==='copy'){const url=new URL(location.href);url.search='';url.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(url.href);toast('邀请链接已复制，请另行告知好友通行密码')}catch{dialog('copy','复制邀请链接','<label class="field">分享给好友<input readonly value="'+esc(url.href)+'"></label>')}return}
 if(a==='ready')return adjust('ready',{ready:!room.seats.find(s=>s.id===room.you).ready});
 if(a==='remove')return adjust('remove',{id});if(['bot','start','leave','rematch'].includes(a))return adjust(a);
 if(a==='return'){clearRoom(room.code);await listRooms();return}
 if(a==='board-info')return boardInfo();if(a==='team')return team(id);
 if(a==='clear'){chosen=zero();draw();return}
 const g=room.game;if(!g)return;const p=g.players.find(s=>s.id===room.you);
 if(a==='choose'||a==='give'){const cap=a==='give'?p.balls[id]:Math.min(g.bank[id],g.bank[id]>=4?2:1);chosen[id]=(chosen[id]+1)%(cap+1);if(a==='choose'&&chosen[id]===1&&total(chosen)>3){chosen=zero();chosen[id]=1}draw();return}
 if(a==='confirm-balls')return adjust('move',{move:{type:g.phase==='discard'?'discard':'take',balls:chosen}});
 if(a==='blind')return adjust('move',{move:{type:'reserve',deck:+id}});
 if(['reserve','catch'].includes(a))return adjust('move',{move:{type:a,card:id}});
 if(a==='evolve')return adjust('move',{move:{type:a,from:el.dataset.from,to:id}});
 if(a==='end')return adjust('move',{move:{type:'end'}});
});
document.addEventListener('submit',async e=>{const f=e.target;if(!f.dataset.form)return;e.preventDefault();initAudio();const data=Object.fromEntries(new FormData(f)),kind=f.dataset.form;
 if(kind==='manual-evolve'){await adjust('move',{move:{type:'evolve',from:data.from,to:data.to}});return}
 if(kind==='profile'){profile={name:data.name.trim()||'训练师',avatar:Number(data.avatar)||25};save('profile',profile);closeModal();draw();return}
 if(kind==='chat'){if(!String(data.text||'').trim())return;const showInfo=modal==='board-info';await adjust('chat',{text:data.text});if(showInfo&&room?.game)boardInfo();return}
 if(pending)return;const submit=f.querySelector('[type=submit]');if(submit)submit.disabled=true;
 try{if(kind==='access'){pending=true;const res=await clubFetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:data.password})});const v=await res.json();if(!res.ok)throw Error(v.error||'无法进入大厅');pending=false;playAudio('turn',sound);await unlocked()}
 else{profile.name=data.name.trim()||'训练师';save('profile',profile);if(kind==='join')return await joinCode(data.code);pending=true;const r=await api({kind:'create',title:data.title,capacity:+data.capacity,mode:data.mode,listed:!!data.listed,...profile});closeModal();receive(r)}}
 catch(err){errors(err.message)}finally{pending=false;if(submit)submit.disabled=false}});
document.addEventListener('input',e=>{if(e.target.name==='search'){search=e.target.value;const grid=$('.albumgrid');grid.innerHTML=cards.filter(c=>(!tierFilter||c.tier===tierFilter)&&c.name.includes(search)).map(c=>cardTile(c.id)).join('')||'<p>没有匹配的宝可梦。</p>'}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Tab'&&modal){const all=[...layers.querySelectorAll('button:not(:disabled),input,select,a,summary')];if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0]?.focus()}}});
draw();clubFetch('/api/access',{cache:'no-store'}).then(r=>r.json()).then(v=>{if(v.open)unlocked()}).catch(()=>{});setInterval(refresh,2200);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
