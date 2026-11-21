const backendOrigin = 'https://kanto-crystal-club.beefyloach64.chatgpt.site';
const routes = new Set(['/api/access', '/api/table']);
const maxBodySize = 8192;

function error(message, status) {
  return new Response(JSON.stringify({error: message}), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
  });
}

export async function onRequest({request}) {
  const url = new URL(request.url);
  if (!routes.has(url.pathname)) return error('接口不存在', 404);
  if (!['GET', 'POST'].includes(request.method)) return error('请求方式有误', 405);

  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return error('请从游戏大厅发起操作', 403);

  const headers = new Headers({Accept: 'application/json'});
  const authorization = request.headers.get('authorization');
  const session = request.headers.get('cookie')?.split(';')
    .map(part => part.trim()).find(part => part.startsWith('kanto_gate='));
  if (authorization) headers.set('Authorization', authorization);
  if (session) headers.set('Cookie', session);

  const init = {method: request.method, headers, redirect: 'manual'};
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type')?.split(';')[0].trim();
    if (contentType !== 'application/json') return error('请求格式有误', 415);
    if (Number(request.headers.get('content-length')) > maxBodySize) {
      return error('请求过大', 413);
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > maxBodySize) return error('请求过大', 413);
    headers.set('Content-Type', 'application/json');
    init.body = body;
  }

  const upstream = new URL(url.pathname, backendOrigin);
  const room = url.searchParams.get('room');
  if (url.pathname === '/api/table' && room) upstream.searchParams.set('room', room);
  let response;
  try {
    response = await fetch(upstream.href, init);
  } catch {
    return error('暂时无法连接联机服务器，请稍后重试', 502);
  }
  if (!response.headers.get('content-type')?.includes('application/json') ||
      (response.status >= 300 && response.status < 400)) {
    return error('联机服务器暂时不可用，请稍后重试', 502);
  }

  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  const setCookie = response.headers.get('set-cookie');
  if (url.pathname === '/api/access' && setCookie?.startsWith('kanto_gate=')) {
    responseHeaders.set('Set-Cookie', setCookie);
  }
  return new Response(response.body, {status: response.status, headers: responseHeaders});
}
