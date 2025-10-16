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

const createKvNamespace = () => {
  const store = new Map();
  return {
    async get(key, options = {}) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      if (options.type === 'json') {
        try {
          return JSON.parse(value);
        } catch (error) {
          throw new Error(`Unable to parse JSON for key ${key}: ${error.message}`);
        }
      }
      return value;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
};

const createEnv = () => ({
  COLLECTION: createKvNamespace(),
  ASSETS: {
    fetch: () => new Response(null, { status: 404 }),
  },
});

// GET should return seeded default data and persist it to KV
{
  const env = createEnv();
  const response = await fetchFromWorker('https://example.com/api/collection', {}, env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert(Array.isArray(payload.owned));
  assert(payload.owned.length > 0, 'expected default owned figures to be returned');
  const stored = await env.COLLECTION.get('collection');
  assert(stored, 'expected default collection to be written to KV');
}

const basicAuth = `Basic ${Buffer.from('admin:figureadmin').toString('base64')}`;

// PUT should sanitize and persist the submitted collection
{
  const env = createEnv();
  const response = await fetchFromWorker(
    'https://example.com/api/collection',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth,
      },
      body: JSON.stringify({
        owned: [
          {
            name: ' Test Figure ',
            slug: 'test-figure',
            tags: ' magical ,  girl ',
            mfcId: '12345',
            alt: ' ',
            links: { mfc: ' https://example.com/item/12345 ' },
          },
        ],
        wishlist: [
          {
            name: 'Wishlist Entry',
            slug: 'wishlist-entry',
            tags: [' limited ', ''],
            mfcId: null,
          },
        ],
      }),
    },
    env,
  );

  assert.equal(response.status, 200);
  const { updatedAt } = await response.json();
  assert(updatedAt, 'expected updatedAt timestamp in response');

  const getResponse = await fetchFromWorker('https://example.com/api/collection', {}, env);
  const collection = await getResponse.json();
  assert.equal(collection.owned.length, 1);
  assert.deepEqual(collection.owned[0].tags, ['magical', 'girl']);
  assert.equal(collection.owned[0].mfcId, 12345);
  assert.equal(collection.owned[0].alt, '');
  assert.equal(collection.owned[0].links.mfc, 'https://example.com/item/12345');
  assert.equal(collection.wishlist.length, 1);
  assert.deepEqual(collection.wishlist[0].tags, ['limited']);
}

console.log('Collection tests passed');
