/**
 * oauth-worker/index.js
 * Cloudflare Worker — intermediário OAuth para o Decap CMS com GitHub.
 *
 * Deploy como Worker separado (não como Pages Function).
 * Rotas:
 *   GET  /oauth/authorize  → redireciona para GitHub OAuth
 *   GET  /oauth/callback   → troca code por token e retorna ao CMS
 *
 * Variáveis de ambiente (definidas no painel Cloudflare → Workers → Settings → Variables):
 *   GITHUB_CLIENT_ID      → Client ID do GitHub OAuth App
 *   GITHUB_CLIENT_SECRET  → Client Secret do GitHub OAuth App
 *   ALLOWED_ORIGIN        → https://seusite.com
 */

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL     = 'https://github.com/login/oauth/access_token';
const SCOPE                = 'repo,user';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── 1. Inicia o fluxo OAuth ──────────────────────────────────
    if (url.pathname === '/oauth/authorize') {
      const params = new URLSearchParams({
        client_id:    env.GITHUB_CLIENT_ID,
        scope:        SCOPE,
        redirect_uri: `${env.ALLOWED_ORIGIN}/oauth/callback`,
      });
      return Response.redirect(`${GITHUB_AUTHORIZE_URL}?${params}`, 302);
    }

    // ── 2. Callback: troca code por token ────────────────────────
    if (url.pathname === '/oauth/callback') {
      const code = url.searchParams.get('code');

      if (!code) {
        return new Response('Código OAuth ausente.', { status: 400 });
      }

      // Troca o code pelo token junto ao GitHub
      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        body: JSON.stringify({
          client_id:     env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri:  `${env.ALLOWED_ORIGIN}/oauth/callback`,
        }),
      });

      const data = await tokenRes.json();

      if (data.error || !data.access_token) {
        return new Response(`Erro OAuth: ${data.error_description || 'desconhecido'}`, {
          status: 400,
        });
      }

      // Retorna o token ao Decap CMS via postMessage (padrão do CMS)
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body>
<script>
  (function() {
    const token   = ${JSON.stringify(data.access_token)};
    const message = JSON.stringify({ token, provider: 'github' });
    // postMessage para a janela pai (o painel CMS)
    if (window.opener) {
      window.opener.postMessage('authorization:github:success:' + message, ${JSON.stringify(env.ALLOWED_ORIGIN)});
    }
    window.close();
  })();
<\/script>
<p>Autenticando… esta janela fechará automaticamente.</p>
</body>
</html>`;

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
