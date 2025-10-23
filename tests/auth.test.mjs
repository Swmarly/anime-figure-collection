import assert from 'node:assert/strict';

const ensureBase64Helpers = () => {
  if (typeof globalThis.atob !== 'function') {
    globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');
  }
  if (typeof globalThis.btoa !== 'function') {
    globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
  }
};

ensureBase64Helpers();

const worker = await import('../worker.js');

const fetchFromWorker = (url, init = {}, env = {}) => worker.default.fetch(new Request(url, init), env, {});

const parseJson = async (response) => {
  const clone = response.clone();
  const contentType = clone.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  try {
    return await clone.json();
  } catch {
    return null;
  }
};

// Successful login with default credentials
{
  const response = await fetchFromWorker('https://example.com/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'figureadmin' }),
  });

  assert.equal(response.status, 200);
  assert.ok(response.headers.get('set-cookie'), 'expected a session cookie to be returned');
  const payload = await parseJson(response);
  assert.deepEqual(payload, { success: true });
}

// Trailing slash on the login endpoint should be accepted
{
  const response = await fetchFromWorker('https://example.com/api/login/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'figureadmin' }),
  });

  assert.equal(response.status, 200);
}

// Invalid credentials should report an error payload
{
  const response = await fetchFromWorker('https://example.com/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });

  assert.equal(response.status, 401);
  const payload = await parseJson(response);
  assert(payload?.error?.includes('Invalid username or password'));
}

// GET requests should be rejected with Method Not Allowed
{
  const response = await fetchFromWorker('https://example.com/api/login', {
    method: 'GET',
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
}

console.log('Auth tests passed');

// The login page without an extension should be served directly to prevent redirect loops
// triggered by upstream permanent redirects (e.g. 308 responses when requesting /admin/login).
{
  const assetEnv = {
    ASSETS: {
      fetch: (request) => {
        const assetUrl = new URL(request.url);
        if (assetUrl.pathname === '/admin/login.html') {
          return new Response(`<!DOCTYPE html><title>Login</title><h1>Sign in to the Figure Admin Panel</h1>`, {
            headers: { 'Content-Type': 'text/html' },
          });
        }
        if (assetUrl.pathname === '/index.html') {
          return new Response('<!DOCTYPE html><title>Home</title>', {
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return new Response(null, {
          status: 308,
          headers: {
            Location: 'https://example.com/admin/login/',
          },
        });
      },
    },
  };

  const response = await fetchFromWorker(
    'https://example.com/admin/login',
    {
      headers: { Accept: 'text/html' },
    },
    assetEnv,
  );

  assert.equal(response.status, 200);
  const contentType = response.headers.get('Content-Type') || '';
  assert(contentType.includes('text/html'));
  const body = await response.text();
  assert(body.includes('Sign in to the Figure Admin Panel'));
}

console.log('Login page test passed');

// Local development over HTTP should not receive secure cookies even if proxy headers claim HTTPS.
{
  const response = await fetchFromWorker('http://localhost/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Visitor': '{"scheme":"https"}',
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify({ username: 'admin', password: 'figureadmin' }),
  });

  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie') || '';
  assert(!/;\s*secure/i.test(setCookie), 'expected session cookie to be usable over HTTP during local development');
}

// Invalid session cookies should be cleared when accessing protected HTML pages
{
  const response = await fetchFromWorker('https://example.com/admin/index.html', {
    headers: {
      Cookie: 'figure_admin_session=invalid',
      Accept: 'text/html',
    },
  });

  assert.equal(response.status, 303);
  const redirectUrl = new URL(response.headers.get('Location'));
  assert.equal(redirectUrl.origin + redirectUrl.pathname, 'https://example.com/admin/login.html');
  assert.equal(redirectUrl.searchParams.get('redirect'), '/admin/index.html');
  const setCookie = response.headers.get('set-cookie') || '';
  assert(setCookie.includes('figure_admin_session='));
  assert(setCookie.includes('Max-Age=0'));
}

// Invalid session cookies should be cleared when requesting other protected resources
{
  const response = await fetchFromWorker('https://example.com/admin/admin.css', {
    headers: {
      Cookie: 'figure_admin_session=expired-token',
    },
  });

  assert.equal(response.status, 401);
  const setCookie = response.headers.get('set-cookie') || '';
  assert(setCookie.includes('figure_admin_session='));
  assert(setCookie.includes('Max-Age=0'));
}

console.log('Local cookie policy test passed');
