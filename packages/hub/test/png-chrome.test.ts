import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromeSearchPaths, pngSize } from '../src/png.js';
import { encodeRgbaPng, scalePngTo } from '../src/png-scale.js';

describe('chrome discovery', () => {
  it('lists Windows Edge, user-level Chrome, and LOCALAPPDATA', () => {
    const paths = chromeSearchPaths(
      {
        ProgramFiles: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
        LOCALAPPDATA: 'C:\\Users\\sam\\AppData\\Local',
      },
      'win32',
      'C:\\Users\\sam',
    );
    assert.ok(paths.some((p) => p.endsWith('chrome.exe') && p.includes('Local')));
    assert.ok(paths.some((p) => p.endsWith('msedge.exe')));
    assert.ok(paths.some((p) => p.includes('Brave')));
  });

  it('lists Mac Chrome, Edge, Brave, and ~/Applications', () => {
    const paths = chromeSearchPaths({}, 'darwin', '/Users/sam');
    assert.ok(paths.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
    assert.ok(paths.includes('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'));
    assert.ok(paths.some((p) => p.includes('/Users/sam/Applications')));
  });
});

describe('png scale', () => {
  it('downscales a 2x HiDPI PNG to the lock-screen size', () => {
    const rgba = Buffer.alloc(4 * 4);
    for (let i = 0; i < 4; i++) {
      rgba[i * 4] = 20;
      rgba[i * 4 + 1] = 40;
      rgba[i * 4 + 2] = 60;
      rgba[i * 4 + 3] = 255;
    }
    const src = encodeRgbaPng(2, 2, rgba);
    const out = scalePngTo(src, 1, 1);
    const size = pngSize(out);
    assert.equal(size.w, 1);
    assert.equal(size.h, 1);
  });
});
