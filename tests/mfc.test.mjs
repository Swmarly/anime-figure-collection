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
</head><body>
<table>
  <tr><th>Classification</th><td>Prize</td></tr>
  <tr><th>Product line</th><td>Luminasta</td></tr>
  <tr><th>Origin</th><td>Re:Zero kara Hajimeru Isekai Seikatsu</td></tr>
  <tr><th>Character</th><td>Rem</td></tr>
  <tr><th>Company</th><td>SEGA as Manufacturer</td></tr>
  <tr><th>Version</th><td>Ameagari Day</td></tr>
  <tr><th>Release</th><td>01/31/2024 as Prize (Japan)<br/>04/14/2023 as Prize (Japan)</td></tr>
  <tr><th>Materials</th><td>ABS, PVC</td></tr>
  <tr><th>Dimensions</th><td>W=130mm (5.07in)<br/>H=210mm (8.19in)</td></tr>
</table>
</body></html>`;

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
  assert.equal(payload.classification, 'Prize');
  assert.equal(payload.productLine, 'Luminasta');
  assert.equal(payload.origin, 'Re:Zero kara Hajimeru Isekai Seikatsu');
  assert.equal(payload.character, 'Rem');
  assert.deepEqual(payload.companies, [{ name: 'SEGA', role: 'Manufacturer' }]);
  assert.equal(payload.version, 'Ameagari Day');
  assert.equal(payload.releaseDate, '2023-04');
  assert.deepEqual(payload.releases.slice(0, 2), [
    { label: '01/31/2024 as Prize (Japan)', date: '2024-01-31', type: 'Prize', region: 'Japan' },
    { label: '04/14/2023 as Prize (Japan)', date: '2023-04-14', type: 'Prize', region: 'Japan' },
  ]);
  assert.deepEqual(payload.materials, ['ABS', 'PVC']);
  assert.equal(payload.dimensions, 'W=130mm (5.07in)\nH=210mm (8.19in)');
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
