import assert from 'node:assert/strict';

const worker = await import('../worker.js');
const originalFetch = globalThis.fetch;
const authHeader = 'Basic ' + Buffer.from('admin:figureadmin').toString('base64');

try {
  // Item imports require the linked API bridge; there is no HTML scraper fallback.
  {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error('A missing bridge must not trigger a direct MFC request');
    };
    const response = await worker.default.fetch(
      new Request('https://example.com/api/mfc?item=1685257', {
        headers: { Authorization: authHeader },
      }),
      {},
      {},
    );
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /MFC_API_URL is not configured/i);
    assert.equal(fetchCount, 0);
  }

  // The Worker rejects a non-HTTPS bridge origin before contacting it.
  {
    globalThis.fetch = async () => {
      throw new Error('An invalid bridge URL must not be fetched');
    };
    const response = await worker.default.fetch(
      new Request('https://example.com/api/mfc?item=1685257', {
        headers: { Authorization: authHeader },
      }),
      { MFC_API_URL: 'http://bridge.example', MFC_API_TOKEN: 'bridge-secret' },
      {},
    );
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /must use HTTPS/i);
  }

  // Configured bridge uses the linked Python API payload and keeps its token server-side.
  {
    let fetchCount = 0;
    globalThis.fetch = async (input, init = {}) => {
      fetchCount += 1;
      const url = typeof input === 'string' ? input : input.url;
      assert.equal(url, 'https://bridge.example/api/item/1685257');
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer bridge-secret');
      return new Response(JSON.stringify({
        id: 1685257,
        name: 'Rem',
        picture_large: 'https://static.myfigurecollection.net/upload/items/2/rem.jpg',
        gallery: ['https://static.myfigurecollection.net/upload/pictures/2025/07/18/rem-alt.jpeg'],
        picture: 'https://static.myfigurecollection.net/upload/items/1/rem-back.jpg',
        thumbnail: 'https://evil.example/rem.jpg',
        origins: [{ name: 'Re:Zero Starting Life' }],
        characters: [{ name: 'Rem' }],
        companies: [{ name: 'Good Smile Company', role: 'Manufacturer' }],
        classifications: [{ name: 'Scale Figure' }],
        releases: [{ date: '12/2023' }, { date: '02/2024' }],
        scale: '1/7',
        extra: { Description: 'Rem figure with blue hair. Displayed on a snowy base.' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const response = await worker.default.fetch(
      new Request('https://example.com/api/mfc?item=1685257', {
        headers: { Authorization: authHeader },
      }),
      { MFC_API_URL: 'https://bridge.example', MFC_API_TOKEN: 'bridge-secret' },
      {},
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, 'Rem');
    assert.equal(payload.series, 'Re:Zero Starting Life');
    assert.equal(payload.manufacturer, 'Good Smile Company');
    assert.equal(payload.scale, '1/7');
    assert.equal(payload.releaseDate, '2023-12');
    assert.equal(payload.mfcId, 1685257);
    assert.equal(payload.description, 'Rem figure with blue hair. Displayed on a snowy base.');
    assert.equal(payload.caption, 'Rem figure with blue hair.');
    assert.deepEqual(payload.images, [
      'https://static.myfigurecollection.net/upload/items/2/rem.jpg',
      'https://static.myfigurecollection.net/upload/pictures/2025/07/18/rem-alt.jpeg',
      'https://static.myfigurecollection.net/upload/items/1/rem-back.jpg',
    ]);
    assert.deepEqual(payload.tags, ['Scale Figure', 'Rem']);
    assert.equal(payload.links.mfc, 'https://myfigurecollection.net/item/1685257');
    assert.equal(fetchCount, 1);
  }

  // The public image route needs no admin session and fetches through the bridge.
  {
    const imageBytes = new Uint8Array([255, 216, 255, 217]);
    let fetchCount = 0;
    globalThis.fetch = async (input, init = {}) => {
      fetchCount += 1;
      const url = typeof input === 'string' ? input : input.url;
      assert.equal(
        url,
        'https://bridge.example/api/image?url=' +
          encodeURIComponent('https://static.myfigurecollection.net/upload/items/2/rem.jpg'),
      );
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer bridge-secret');
      return new Response(imageBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    };
    const proxyUrl =
      'https://example.com/api/mfc/image?url=' +
      encodeURIComponent('https://static.myfigurecollection.net/upload/items/2/rem.jpg');
    const response = await worker.default.fetch(
      new Request(proxyUrl),
      { MFC_API_URL: 'https://bridge.example', MFC_API_TOKEN: 'bridge-secret' },
      {},
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
    assert.match(response.headers.get('Cache-Control'), /immutable/);
    assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), Array.from(imageBytes));
    assert.equal(fetchCount, 1);
  }

  // MFC images also require the bridge; a failed setup produces a clear response.
  {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      throw new Error('A missing bridge must not trigger a direct image request');
    };
    const proxyUrl =
      'https://example.com/api/mfc/image?url=' +
      encodeURIComponent('https://static.myfigurecollection.net/upload/items/2/rem.jpg');
    const response = await worker.default.fetch(new Request(proxyUrl), {}, {});
    assert.equal(response.status, 503);
    assert.match(await response.text(), /MFC_API_URL is not configured/i);
    assert.equal(fetchCount, 0);
  }

  // Image proxy rejects arbitrary hosts and nonstandard ports before upstream access.
  {
    globalThis.fetch = async () => {
      throw new Error('An invalid image URL must not be fetched');
    };
    for (const invalidUrl of [
      'https://evil.example/image.jpg',
      'https://static.myfigurecollection.net:8443/upload/items/2/rem.jpg',
    ]) {
      const response = await worker.default.fetch(
        new Request('https://example.com/api/mfc/image?url=' + encodeURIComponent(invalidUrl)),
        { MFC_API_URL: 'https://bridge.example', MFC_API_TOKEN: 'bridge-secret' },
        {},
      );
      assert.equal(response.status, 400);
    }
  }

  // A bridge network failure returns a controlled Worker response.
  {
    globalThis.fetch = async () => {
      throw new Error('simulated network failure');
    };
    const proxyUrl =
      'https://example.com/api/mfc/image?url=' +
      encodeURIComponent('https://static.myfigurecollection.net/upload/items/2/rem.jpg');
    const response = await worker.default.fetch(
      new Request(proxyUrl),
      { MFC_API_URL: 'https://bridge.example', MFC_API_TOKEN: 'bridge-secret' },
      {},
    );
    assert.equal(response.status, 503);
    assert.match(await response.text(), /bridge is unavailable/i);
  }

  console.log('MFC API bridge and image proxy tests passed');
} finally {
  globalThis.fetch = originalFetch;
}
