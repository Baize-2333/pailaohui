import {fromPages} from './pages.mjs';
const enc=new TextEncoder();
const bytes=s=>Uint8Array.from(s.match(/../g)||[],c=>parseInt(c,16));
const hex=b=>Array.from(new Uint8Array(b),i=>i.toString(16).padStart(2,'0')).join('');
async function hmac(env){return crypto.subtle.importKey('raw',enc.encode(JSON.stringify([env.SESSION_SIGNING_KEY,env.CLUB_PASSWORD])),{name:'HMAC',hash:'SHA-256'},false,['verify','sign'])}
export async function allowed(req,env){
 if(!env.SESSION_SIGNING_KEY||!env.CLUB_PASSWORD)return false;
 const token=fromPages(req,env)?(req.headers.get('x-club-session')||''):(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('kanto_gate='))?.slice(11)||'';
 const [expiry,sig]=token.split('.');if(!/^\d{10,14}$/.test(expiry)||Number(expiry)<Date.now()||!(/^[\da-f]{64}$/).test(sig||''))return false;
 return crypto.subtle.verify('HMAC',await hmac(env),bytes(sig),enc.encode(expiry));
}
const reply=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...extra}});
export async function gate(req,env){
 if(req.method==='GET')return reply({open:await allowed(req,env)});
 if(req.method!=='POST')return reply({error:'请求方式有误'},405);
 if(!env.SESSION_SIGNING_KEY||!env.CLUB_PASSWORD)return reply({error:'入口暂未配置，请联系房主'},503);
 const body=await req.json().catch(()=>({}));if(typeof body.password!=='string'||body.password.length>128)return reply({error:'请输入通行密码'},400);
 const k=await hmac(env);const correct=await crypto.subtle.sign('HMAC',k,enc.encode(env.CLUB_PASSWORD));
 if(!await crypto.subtle.verify('HMAC',k,correct,enc.encode(body.password)))return reply({error:'密码不正确，请向房主确认后再试'},401);
 const expiry=String(Date.now()+7*86400e3);const sig=hex(await crypto.subtle.sign('HMAC',k,enc.encode(expiry)));const secure=new URL(req.url).protocol==='https:'?'; Secure':'';
 if(fromPages(req,env))return reply({open:true,session:expiry+'.'+sig});
 return reply({open:true},200,{'Set-Cookie':'kanto_gate='+expiry+'.'+sig+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+secure});
}
