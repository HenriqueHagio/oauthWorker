// oauth-worker/index.js
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL     = 'https://github.com/login/oauth/access_token';
const SCOPE                = 'repo,user';
const ORIGIN               = 'https://atelierdanca.com.br';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GET /auth/authorize → inicia OAuth
    if (url.pathname === '/auth/authorize') {
      const params = new URLSearchParams({
        client_id:    env.GITHUB_CLIENT_ID,
        scope:        SCOPE,
        redirect_uri: `${ORIGIN}/auth/callback`,
      });
      return Response.redirect(`${GITHUB_AUTHORIZE_URL}?${params}`, 302);
    }

    // GET /auth/callback → troca code por token
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');

      if (!code) {
        return new Response('Código OAuth ausente.', { status: 400 });
      }

      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        body: JSON.stringify({
          client_id:     env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri:  `${ORIGIN}/auth/callback`,
        }),
      });

      const data = await tokenRes.json();

      if (data.error || !data.access_token) {
        return new Response(
          `Erro OAuth: ${data.error_description || 'desconhecido'}`,
          { status: 400 }
        );
      }

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body>
<script>
  (function() {
    const token   = ${JSON.stringify(data.access_token)};
    const message = JSON.stringify({ token, provider: 'github' });
    if (window.opener) {
      window.opener.postMessage(
        'authorization:github:success:' + message,
        ${JSON.stringify(ORIGIN)}
      );
    }
    window.close();
  })();
<\/script>
<p>Autenticando… esta janela fechará automaticamente.</p>
</body>
</html>`;

      return new Response(html, {
        headers: {
          'Content-Type':                'text/html;charset=UTF-8',
          'Access-Control-Allow-Origin': ORIGIN,
        },
      });
    }

    return new Response(
      `Not found: ${url.pathname}`,
      { status: 404 }
    );
  },
};
