import assert from 'node:assert/strict';

const worker = await import('../worker.js');

const sampleHtml = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Rem" />
<meta property="og:image" content="https://example.com/rem.jpg" />
<meta property="og:description" content="Rem figure with blue hair." />
<meta name="keywords" content="rem, demon, Re:Zero as Franchise" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Rem",
  "image": "https://example.com/rem.jpg",
  "description": "Rem figure with blue hair.",
  "brand": { "@type": "Organization", "name": "SEGA as Manufacturer" },
  "scale": "Prize Figure as Classification",
  "category": ["Re:Zero kara Hajimeru Isekai Seikatsu as Franchise"],
  "keywords": ["rem", "demon", "Re:Zero as Franchise"],
  "offers": { "@type": "Offer", "price": "0", "releaseDate": "2024-05-01" }
}
</script>
</head><body></body></html>`;

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('myfigurecollection.net/item/1685257')) {
    return new Response(sampleHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
  throw new Error(`Unexpected fetch for URL: ${url}`);
};

try {
  const authHeader = `Basic ${Buffer.from('admin:figureadmin').toString('base64')}`;
  const response = await worker.default.fetch(
    new Request('https://example.com/api/mfc?item=1685257', {
      headers: { Authorization: authHeader },
    }),
    {},
    {},
  );

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.name, 'Rem');
  assert.equal(payload.image, 'https://example.com/rem.jpg');
  assert.equal(payload.description, 'Rem figure with blue hair.');
  assert.equal(payload.caption, 'Rem figure with blue hair.');
  assert.equal(payload.series, 'Re:Zero kara Hajimeru Isekai Seikatsu');
  assert.equal(payload.manufacturer, 'SEGA');
  assert.equal(payload.scale, 'Prize Figure');
  assert.equal(payload.releaseDate, '2024-05');
  assert.deepEqual(payload.tags, [
    'rem',
    'demon',
    'Re:Zero',
    'Re:Zero kara Hajimeru Isekai Seikatsu',
  ]);
  assert.equal(payload.links?.mfc, 'https://myfigurecollection.net/item/1685257');

  console.log('MFC lookup parsing test passed');
} finally {
  globalThis.fetch = originalFetch;
}
