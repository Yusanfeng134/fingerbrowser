import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRendererEntry } from '../src/main/renderer-entry';

describe('main renderer entry resolution', () => {
  it('ignores the dev renderer URL in packaged builds', () => {
    const entry = resolveRendererEntry({
      isPackaged: true,
      mainDir: '/Applications/FingerBrowser.app/Contents/Resources/app.asar/out/main',
      rendererUrl: 'file:///tmp/assets/index-YF02UkJi.js'
    });

    expect(entry).toEqual({
      kind: 'file',
      value: path.join(
        '/Applications/FingerBrowser.app/Contents/Resources/app.asar/out/main',
        '../renderer/index.html'
      )
    });
  });

  it('uses the dev renderer URL only for unpackaged development runs', () => {
    expect(
      resolveRendererEntry({
        isPackaged: false,
        mainDir: '/repo/out/main',
        rendererUrl: 'http://127.0.0.1:5173'
      })
    ).toEqual({
      kind: 'url',
      value: 'http://127.0.0.1:5173'
    });
  });

  it('loads the built renderer html when no dev URL is provided', () => {
    expect(
      resolveRendererEntry({
        isPackaged: false,
        mainDir: '/repo/out/main',
        rendererUrl: ''
      })
    ).toEqual({
      kind: 'file',
      value: path.join('/repo/out/main', '../renderer/index.html')
    });
  });
});
