/*
 * Resizes and compresses a product photo IN THE BROWSER (960 and 480 px
 * wide) before upload, so the Worker never touches pixels (10 ms CPU
 * budget) — see lib/loja-images.ts. WebP when the browser can encode it,
 * JPEG otherwise (Safari's canvas can't write WebP). Quality steps down
 * until each size fits its budget.
 */

const BUDGET = { 960: 240 * 1024, 480: 80 * 1024 } as const;
const QUALITIES = [0.86, 0.78, 0.7, 0.6, 0.5];

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function encode(source: ImageBitmap, width: number, budget: number, preferWebp: boolean) {
  const w = Math.min(width, source.width);
  const h = Math.round((source.height * w) / source.width);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // White under transparent PNGs (JPEG has no alpha; WebP keeps it anyway).
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  let type = preferWebp ? "image/webp" : "image/jpeg";
  for (const q of QUALITIES) {
    const blob = await toBlob(canvas, type, q);
    if (!blob) continue;
    // Browsers that can't encode WebP silently return PNG.
    if (blob.type !== type) {
      type = "image/jpeg";
      continue;
    }
    if (blob.size <= budget) return { type, blob, width: w, height: h };
  }
  return null;
}

export type PreparedImage = {
  mime: "image/webp" | "image/jpeg";
  large: { data: string; width: number; height: number };
  small: { data: string; width: number; height: number };
  previewUrl: string;
};

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use uma foto JPG, PNG ou WebP.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Foto muito grande (máximo 25 MB).");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 300) throw new Error("Foto muito pequena: use pelo menos 300 px de largura.");
    let large = await encode(bitmap, 960, BUDGET[960], true);
    if (!large) throw new Error("Não foi possível comprimir esta foto.");
    let small = await encode(bitmap, 480, BUDGET[480], large.type === "image/webp");
    // Both sizes must share one format.
    if (small && small.type !== large.type) {
      large = await encode(bitmap, 960, BUDGET[960], false);
      small = await encode(bitmap, 480, BUDGET[480], false);
    }
    if (!large || !small) throw new Error("Não foi possível comprimir esta foto.");
    return {
      mime: large.type as PreparedImage["mime"],
      large: { data: await base64(large.blob), width: large.width, height: large.height },
      small: { data: await base64(small.blob), width: small.width, height: small.height },
      previewUrl: URL.createObjectURL(large.blob),
    };
  } finally {
    bitmap.close();
  }
}
