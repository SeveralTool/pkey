import { injectPwaCsp, injectPwaBootUi, getPwaAsset } from '../web/index';

describe('injectPwaCsp', () => {
  it('strips static CSP meta and adds nonce to script tags', () => {
    const html = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'">
<script type="module">console.log(1)</script>
</head><body></body></html>`;
    const out = injectPwaCsp(html, '192.168.1.1', 7392, 'abc123');
    expect(out).not.toContain('unsafe-inline');
    expect(out).toContain('nonce="abc123"');
    expect(out).not.toContain('Content-Security-Policy');
  });
});

describe('injectPwaBootUi', () => {
  it('stamps html lang/theme and injects a nonced boot script', () => {
    const html = `<!doctype html>\n<html lang="en" data-theme="dark">\n  <head>\n    <title>PKEY</title>\n  </head>\n</html>`;
    const out = injectPwaBootUi(html, { language: 'ESP', theme: 'LIGHT' }, 'abc123');
    expect(out).toContain('lang="es"');
    expect(out).toContain('data-theme="light"');
    expect(out).toContain('nonce="abc123"');
    expect(out).toContain('window.__PKEY_BOOT_UI__={"language":"ESP","theme":"LIGHT"}');
  });

  it('stamps AUTO language into the boot script', () => {
    const html = `<!doctype html>\n<html lang="en" data-theme="dark">\n  <head></head>\n</html>`;
    const out = injectPwaBootUi(html, { language: 'AUTO', theme: 'AUTO' });
    expect(out).toContain('window.__PKEY_BOOT_UI__={"language":"AUTO","theme":"AUTO"}');
  });
});

describe('getPwaAsset', () => {
  it('returns PNG bytes for the brand logo', () => {
    const asset = getPwaAsset('/brand-logo.png');
    expect(asset?.mime).toBe('image/png');
    expect(asset?.body.subarray(0, 8).toString('binary')).toBe('\x89PNG\r\n\x1a\n');
  });

  it('ignores a query string', () => {
    expect(getPwaAsset('/manifest.webmanifest?v=1')?.mime).toBe('application/manifest+json');
  });

  it('rejects unknown and traversal paths', () => {
    expect(getPwaAsset('/nope.png')).toBeNull();
    expect(getPwaAsset('/../brand-logo.png')).toBeNull();
    expect(getPwaAsset('brand-logo.png')).toBeNull();
  });
});
