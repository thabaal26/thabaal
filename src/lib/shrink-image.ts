// Browser only. Phone photos are often 3–8 MB, more than an upload can carry (Vercel takes 4.5 MB a request), and far
// more than a product photo or a WhatsApp image needs. Before uploading, a photo is redrawn at most 1600 px on its
// long side as a JPEG; small photos and PDFs go as they are.

const MAX_SIDE = 1600;
const SMALL_ENOUGH = 900_000;

export async function shrinkImage(file: File, maxSide = MAX_SIDE): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file); // turned the right way up from the photo's own orientation
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH) {
      bmp.close();
      return file;
    }
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // a transparent PNG gets a white background, as WhatsApp shows it
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // can't read it here: let the server say what's wrong
  }
}
