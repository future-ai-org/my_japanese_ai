const DOC_ASSET_URLS = import.meta.glob("../../../documentation/assets/*", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

export function resolveDocAssetSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const match = /^(?:\.\.?\/)?assets\/([^?#]+)$/.exec(src);
  if (!match) return src;

  const suffix = `/documentation/assets/${match[1]}`;
  const key = Object.keys(DOC_ASSET_URLS).find(
    (candidate) =>
      candidate === `../../../documentation/assets/${match[1]}` ||
      candidate.endsWith(suffix),
  );
  return key ? DOC_ASSET_URLS[key] : src;
}
