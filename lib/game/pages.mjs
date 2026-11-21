export function fromPages(req,env){
  const origin=req.headers.get('origin');
  return Boolean(origin && env.PAGES_ORIGIN?.split(',').some(site=>site.trim()===origin));
}
export async function withPages(req,env,respond){
  const pages=fromPages(req,env);
  if(req.method==='OPTIONS'&&!pages)return new Response(null,{status:403});
  const response=req.method==='OPTIONS'?new Response(null,{status:204}):await respond();
  if(!pages)return response;
  const headers=new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin',req.headers.get('origin'));
  headers.append('Vary','Origin');
  if(req.method==='OPTIONS'){
    headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Club-Session');
    headers.set('Access-Control-Max-Age','600');
  }
  return new Response(response.body,{status:response.status,headers});
}
