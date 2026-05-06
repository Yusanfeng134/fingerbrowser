import path from 'node:path';

export type RendererEntry =
  | {
      kind: 'url';
      value: string;
    }
  | {
      kind: 'file';
      value: string;
    };

export function resolveRendererEntry(input: {
  isPackaged: boolean;
  mainDir: string;
  rendererUrl?: string;
}): RendererEntry {
  const rendererUrl = input.rendererUrl?.trim();

  if (!input.isPackaged && rendererUrl) {
    return {
      kind: 'url',
      value: rendererUrl
    };
  }

  return {
    kind: 'file',
    value: path.join(input.mainDir, '../renderer/index.html')
  };
}
