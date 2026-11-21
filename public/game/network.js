// A Pages project is hosted under /repository/. Its game server has a separate origin.
const backend=document.querySelector('meta[name="club-backend"]')?.content;
const remote=backend && new URL(backend).origin!==location.origin;
const ticketKey='club.ticket.'+new URL('.',import.meta.url).pathname;
export async function clubFetch(path,options={}){
  if(!remote)return fetch(path,options);
  const headers=new Headers(options.headers);
  const ticket=sessionStorage.getItem(ticketKey);
  if(ticket)headers.set('X-Club-Session',ticket);
  const result=await fetch(new URL(path,backend),{...options,headers,credentials:'omit',cache:'no-store'});
  if(result.status===401)sessionStorage.removeItem(ticketKey);
  if(path==='/api/access'&&options.method==='POST'&&result.ok){
    const {session}=await result.clone().json();
    if(session)sessionStorage.setItem(ticketKey,session);
  }
  return result;
}
