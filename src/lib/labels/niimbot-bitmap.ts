/** Most NIIMBOT heads that take 40 mm stock print at 203 dots per inch. */
export const DEFAULT_NIIMBOT_DPI = 203;

/** Pixel size of one 40 × 20 mm label. Width and height stay multiples of 8 so a bitmap row packs into bytes. */
export function niimbotBitmapSize(dpi = DEFAULT_NIIMBOT_DPI) {
  const width = Math.max(8, Math.round(((40 / 25.4) * dpi) / 8) * 8);
  const height = Math.max(8, Math.round((width * 20) / 40 / 8) * 8);
  return { dpi, width, height };
}
