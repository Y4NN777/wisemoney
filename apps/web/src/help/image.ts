const MAX_IMAGE_EDGE = 1280;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export function validateHelpImage(file: File): void {
  if (!file.type.startsWith("image/")) throw new Error("invalid-type");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("too-large");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("invalid-image"));
    };
    image.src = objectUrl;
  });
}

export async function sanitizeHelpImage(file: File): Promise<string> {
  validateHelpImage(file);
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (context == null) throw new Error("canvas-unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function firstImageFromClipboard(items: DataTransferItemList): File | null {
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

