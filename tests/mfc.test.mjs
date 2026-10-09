import assert from 'node:assert/strict';

const worker = await import('../worker.js');

const buildSampleHtml = ({
  firstWidth,
  firstHeight,
  firstGalleryPath = 'items%5C%2F2%5C%2F1685257-main.jpg',
  detailsMarkup = `<table class="item-details">
  <tr><th>Series / Origin</th><td><a href="/entry/1">Re:Zero Starting Life</a></td></tr>
  <tr><th>Manufacturer</th><td><a href="/entry/2">Good Smile Company</a></td></tr>
  <tr><th>Scale</th><td>1/7</td></tr>
  <tr><th>Release date</th><td>2024-08; 2023-12; May 2025</td></tr>
</table>`,
}) => `<!DOCTYPE html><html><head>
<meta property="og:title" content="Rem" />
<meta property="og:image" content="https://static.myfigurecollection.net/upload/items/1/1685257-main.jpg?rev=old" />
<meta property="og:description" content="Rem figure with blue hair." />
<meta name="keywords" content="rem, demon, Re:Zero as Franchise" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Rem",
  "image": [
    "https://static.myfigurecollection.net/upload/items/1/1685257-main.jpg?rev=older",
    { "contentUrl": "https://static.myfigurecollection.net/upload/items/2/1685257-main.jpg?rev=older" }
  ],
  "description": "Rem figure with blue hair.",
  "brand": { "@type": "Organization", "name": "SEGA as Manufacturer" },
  "scale": "Prize Figure as Classification",
  "category": ["Re:Zero kara Hajimeru Isekai Seikatsu as Franchise"],
  "keywords": ["rem", "demon", "Re:Zero as Franchise"],
  "offers": { "@type": "Offer", "price": "0", "releaseDate": "2024-05-01" }
}
</script>
</head><body>
<img src="https://static.myfigurecollection.net/upload/items/2/wrong-related-figure.jpg" />
${detailsMarkup}
<div class="split-left righter">
  <div class="item-picture" style="width:168px">
    <div class="tbx-pswp">
      <a href="#" class="main" _index="0" title="Open official gallery">
        <img src="https://static.myfigurecollection.net/upload/items/1/1685257-main.jpg?rev=old" alt="Rem" width="${firstWidth}" height="${firstHeight}" />
      </a>
      <meta name="pictures" content="%5B%7B%22src%22%3A%22https%3A%5C%2F%5C%2Fstatic.myfigurecollection.net%5C%2Fupload%5C%2F${firstGalleryPath}%22%2C%22w%22%3A${firstWidth}%2C%22h%22%3A${firstHeight}%7D%2C%7B%22src%22%3A%22https%3A%5C%2F%5C%2Fstatic.myfigurecollection.net%5C%2Fupload%5C%2Fpictures%5C%2F2025%5C%2F07%5C%2F18%5C%2F1685257-second.jpeg%22%2C%22w%22%3A1280%2C%22h%22%3A1920%7D%5D" />
      <a class="more" href="#" _index="1" style="background: url(&quot;https://static.myfigurecollection.net/upload/pictures/2025/07/18/thumbnails/1685257-second.jpeg&quot;) 0 0 / cover no-repeat transparent;"></a>
    </div>
  </div>
</div>
</body></html>`;

const originalFetch = globalThis.fetch;

const fetchLookupPayload = async (html, { missingFullSize = false } = {}) => {
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('myfigurecollection.net/item/1685257')) {
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.includes('static.myfigurecollection.net/upload/items/2/1685257-main.jpg')) {
      return new Response('', {
        status: missingFullSize ? 404 : 200,
        headers: missingFullSize ? {} : { 'Content-Type': 'image/jpeg' },
      });
    }
    throw new Error(`Unexpected fetch for URL: ${url}`);
  };

  const authHeader = `Basic ${Buffer.from('admin:figureadmin').toString('base64')}`;
  const response = await worker.default.fetch(
    new Request('https://example.com/api/mfc?item=1685257', {
      headers: { Authorization: authHeader },
    }),
    {},
    {},
  );

  assert.equal(response.status, 200);
  return response.json();
};

try {
  const lowResolutionPayload = await fetchLookupPayload(
    buildSampleHtml({ firstWidth: 320, firstHeight: 480 }),
  );

  assert.equal(lowResolutionPayload.name, 'Rem');
  assert.equal(
    lowResolutionPayload.image,
    'https://static.myfigurecollection.net/upload/items/2/1685257-main.jpg',
  );
  assert.deepEqual(lowResolutionPayload.images, [
    'https://static.myfigurecollection.net/upload/items/2/1685257-main.jpg',
    'https://static.myfigurecollection.net/upload/pictures/2025/07/18/1685257-second.jpeg',
  ]);
  assert.equal(lowResolutionPayload.description, 'Rem figure with blue hair.');
  assert.equal(lowResolutionPayload.caption, 'Rem figure with blue hair.');
  assert.equal(lowResolutionPayload.series, 'Re:Zero Starting Life');
  assert.equal(lowResolutionPayload.manufacturer, 'Good Smile Company');
  assert.equal(lowResolutionPayload.scale, '1/7');
  assert.equal(lowResolutionPayload.releaseDate, '2023-12');
  assert.deepEqual(lowResolutionPayload.tags, [
    'rem',
    'demon',
    'Re:Zero',
    'Re:Zero kara Hajimeru Isekai Seikatsu',
  ]);
  assert.equal(lowResolutionPayload.links?.mfc, 'https://myfigurecollection.net/item/1685257');

  const highResolutionPayload = await fetchLookupPayload(
    buildSampleHtml({ firstWidth: 900, firstHeight: 1350 }),
  );

  assert.equal(
    highResolutionPayload.image,
    'https://static.myfigurecollection.net/upload/items/2/1685257-main.jpg',
  );
  assert.deepEqual(highResolutionPayload.images, [
    'https://static.myfigurecollection.net/upload/items/2/1685257-main.jpg',
    'https://static.myfigurecollection.net/upload/pictures/2025/07/18/1685257-second.jpeg',
  ]);

  const inlineFieldPayload = await fetchLookupPayload(
    buildSampleHtml({
      firstWidth: 900,
      firstHeight: 1350,
      detailsMarkup: `<section class="details-text">Series / Origin: Re:Zero Inline Manufacturer: Max Factory Scale: 1/8 Release Date: 2026-03; 2022-11</section>`,
    }),
  );

  assert.equal(inlineFieldPayload.series, 'Re:Zero Inline');
  assert.equal(inlineFieldPayload.manufacturer, 'Max Factory');
  assert.equal(inlineFieldPayload.scale, '1/8');
  assert.equal(inlineFieldPayload.releaseDate, '2022-11');


  const mfcDataValuePayload = await fetchLookupPayload(
    buildSampleHtml({
      firstWidth: 900,
      firstHeight: 1350,
      detailsMarkup: `<div class="data-value"><a href="/?_tb=item&amp;scale=7" class="item-scale" title="Scale"><small>1/</small>7</a>&nbsp;&nbsp;<small>H=</small><strong>240</strong><small>mm (9.36in, 1:1=1.68m)</small></div>
<div class="data-value"><a href="/?_tb=item&amp;tab=calendar&amp;year=2026&amp;month=02" class="time">02/2026</a> <small class="light">as <em>Limited (Japan)</em></small></div>
<div class="data-value"><a href="/?_tb=item&amp;tab=calendar&amp;year=2024&amp;month=12" class="time">12/2024</a> <small class="light">as <em>Standard</em></small></div>`,
    }),
  );

  assert.equal(mfcDataValuePayload.scale, '1/7');
  assert.equal(mfcDataValuePayload.releaseDate, '2024-12');


  const metadataImagePayload = await fetchLookupPayload(`<!DOCTYPE html><html><head>
<meta property="og:title" content="Metadata figure" />
<meta property="og:image" content="https://static.myfigurecollection.net/upload/items/1/1685257-main.jpg?rev=meta" />
<meta property="og:description" content="Metadata-only image fallback." />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Metadata figure",
  "image": ["https://static.myfigurecollection.net/upload/items/1/1685257-main.jpg?rev=jsonld"],
  "brand": { "name": "Fallback Maker" },
  "scale": "1/7",
  "offers": { "releaseDate": "2024-05-01" }
}
</script>
</head><body><p>No split-left gallery on this response.</p></body></html>`);

  assert.equal(
    metadataImagePayload.image,
    'https://static.myfigurecollection.net/upload/items/2/1685257-main.jpg',
  );
  assert.deepEqual(metadataImagePayload.images, [
    'https://static.myfigurecollection.net/upload/items/2/1685257-main.jpg',
  ]);

  const missingFullSizePayload = await fetchLookupPayload(
    buildSampleHtml({
      firstWidth: 900,
      firstHeight: 1350,
      firstGalleryPath: 'items%5C%2F1%5C%2F1685257-main.jpg',
    }),
    { missingFullSize: true },
  );

  assert.equal(
    missingFullSizePayload.image,
    'https://static.myfigurecollection.net/upload/items/1/1685257-main.jpg',
  );
  assert.deepEqual(missingFullSizePayload.images, [
    'https://static.myfigurecollection.net/upload/items/1/1685257-main.jpg',
    'https://static.myfigurecollection.net/upload/pictures/2025/07/18/1685257-second.jpeg',
  ]);

  console.log('MFC lookup parsing test passed');
} finally {
  globalThis.fetch = originalFetch;
}

  
// Configured bridge uses the linked Python API payload and keeps its token server-side.
{
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    assert.equal(url, 'https://bridge.example/api/item/1685257');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer bridge-secret');
    return new Response(JSON.stringify({
      id: 1685257,
      name: 'Rem',
      picture_large: 'https://static.myfigurecollection.net/upload/items/2/rem.jpg',
      gallery: ['https://static.myfigurecollection.net/upload/pictures/2025/07/18/rem-alt.jpeg'],
      picture: 'https://static.myfigurecollection.net/upload/items/1/rem.jpg',
      thumbnail: null,
      origins: [{ name: 'Re:Zero Starting Life' }],
      characters: [{ name: 'Rem' }],
      companies: [{ name: 'Good Smile Company', role: 'Manufacturer' }],
      classifications: [{ name: 'Scale Figure' }],
      releases: [{ date: '12/2023' }, { date: '02/2024' }],
      scale: '1/7',
      extra: {},
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const authHeader = 'Basic ' + Buffer.from('admin:figureadmin').toString('base64');
  const response = await worker.default.fetch(
    new Request('https://example.com/api/mfc?item=1685257', { headers: { Authorization: authHeader } }),
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
  assert.deepEqual(payload.images, [
    'https://static.myfigurecollection.net/upload/items/2/rem.jpg',
    'https://static.myfigurecollection.net/upload/pictures/2025/07/18/rem-alt.jpeg',
    'https://static.myfigurecollection.net/upload/items/1/rem.jpg',
  ]);
}

// The public image route needs no admin session and uses the authenticated bridge.
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
    return new Response(imageBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
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

// Image proxy rejects arbitrary hosts before making an upstream request.
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
      {},
      {},
    );
    assert.equal(response.status, 400);
  }
}

// A failed direct fallback returns a useful API error instead of an uncaught Worker exception.
{
  globalThis.fetch = async () => {
    throw new Error('simulated network failure');
  };
  const authHeader = 'Basic ' + Buffer.from('admin:figureadmin').toString('base64');
  const response = await worker.default.fetch(
    new Request('https://example.com/api/mfc?item=1685257', { headers: { Authorization: authHeader } }),
    {},
    {},
  );
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.match(payload.error, /request failed/i);
}

globalThis.fetch = originalFetch;
console.log('MFC bridge and image proxy tests passed');
