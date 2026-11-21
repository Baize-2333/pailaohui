// A Pages project is hosted under /repository/. Its game server has a separate origin.
const backend=document.querySelector('meta[name="club-backend"]')?.content;
const remote=backend && new URL(backend).origin!==location.origin;
const ticketKey='club.ticket.'+new URL('.',import.meta.url).pathname;
export async function readClubReply(response){
  try {
    const value=await response.json();
    if(value && typeof value==='object' && !Array.isArray(value))return value;
  } catch {
    // A hosting gateway can send a text or HTML error before the API runs.
  }
  if(!remote && response.status===401 && new URLSearchParams(location.search).has('eo_token')){
    throw Error('预览链接可能已过期，请从 EdgeOne 控制台重新打开预览。');
  }
  throw Error('大厅服务暂时无法访问（HTTP '+response.status+'），请稍后重试。');
}
export async function clubFetch(path,options={}){
  if(!remote){
    const url=new URL(path,location.origin);
    if(url.origin===location.origin){
      const preview=new URLSearchParams(location.search);
      for(const key of ['eo_token','eo_time']){
        if(preview.has(key))url.searchParams.set(key,preview.get(key));
      }
    }
    return fetch(url,options);
  }
  const headers=new Headers(options.headers);
  const ticket=sessionStorage.getItem(ticketKey);
  if(ticket)headers.set('X-Club-Session',ticket);
  const result=await fetch(new URL(path,backend),{...options,headers,credentials:'omit',cache:'no-store'});
  if(result.status===401)sessionStorage.removeItem(ticketKey);
  if(path==='/api/access'&&options.method==='POST'&&result.ok){
    const {session}=await readClubReply(result.clone());
    if(session)sessionStorage.setItem(ticketKey,session);
  }
  return result;
}
