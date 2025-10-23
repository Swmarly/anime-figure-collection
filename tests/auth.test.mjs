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

const basicAuthHeader = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const bodyPayload = JSON.stringify({ owned: [], wishlist: [] });

// Unauthenticated modifications should trigger a Basic challenge and never set cookies
{
  const response = await fetchFromWorker('https://example.com/api/collection', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: bodyPayload,
  });
  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') || '';
  assert(challenge.toLowerCase().includes('basic'));
  assert.equal(response.headers.get('set-cookie'), null);
}

// Successful Basic authentication grants access without cookies
{
  const response = await fetchFromWorker('https://example.com/api/collection', {
    method: 'PUT',
    headers: {
      Authorization: basicAuthHeader('admin', 'figureadmin'),
      'Content-Type': 'application/json',
    },
    body: bodyPayload,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const payload = await parseJson(response);
  assert(payload);
}

// Invalid Basic credentials are rejected with 401
{
  const response = await fetchFromWorker('https://example.com/api/collection', {
    method: 'PUT',
    headers: {
      Authorization: basicAuthHeader('admin', 'wrong'),
      'Content-Type': 'application/json',
    },
    body: bodyPayload,
  });

  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') || '';
  assert(challenge.toLowerCase().includes('basic'));
}

// The admin HTML requires authentication and does not set cookies
{
  const assetEnv = {
    ASSETS: {
      fetch: (request) => {
        const assetUrl = new URL(request.url);
        if (assetUrl.pathname === '/admin/index.html') {
          return new Response('<!DOCTYPE html><title>Admin</title><h1>Admin Panel</h1>', {
            headers: { 'Content-Type': 'text/html' },
          });
        }
        if (assetUrl.pathname === '/index.html') {
          return new Response('<!DOCTYPE html><title>Home</title>', {
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return new Response(null, { status: 404 });
      },
    },
  };

  const unauthorized = await fetchFromWorker(
    'https://example.com/admin/index.html',
    {
      headers: { Accept: 'text/html' },
    },
    assetEnv,
  );
  assert.equal(unauthorized.status, 401);
  const challenge = unauthorized.headers.get('www-authenticate') || '';
  assert(challenge.toLowerCase().includes('basic'));

  const authorized = await fetchFromWorker(
    'https://example.com/admin/index.html',
    {
      headers: {
        Accept: 'text/html',
        Authorization: basicAuthHeader('admin', 'figureadmin'),
      },
    },
    assetEnv,
  );
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get('set-cookie'), null);
}

console.log('Auth tests passed');
