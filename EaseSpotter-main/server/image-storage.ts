import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const dataUrlPattern = /^data:(image\/(?:jpeg|jpg|png|webp|avif));base64,([a-zA-Z0-9+/=\s]+)$/;
const MAX_UPLOAD_IMAGE_BYTES = Number(process.env.MAX_UPLOAD_IMAGE_BYTES || 10 * 1024 * 1024);

const imageOptimizationByDirectory: Record<"products" | "promotions" | "stores", { maxWidth: number; maxHeight: number; quality: number }> = {
  products: { maxWidth: 1200, maxHeight: 1200, quality: 78 },
  promotions: { maxWidth: 1600, maxHeight: 900, quality: 80 },
  stores: { maxWidth: 1600, maxHeight: 900, quality: 80 },
};

const formatUploadLimit = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }

  return `${bytes} bytes`;
};

export const getUploadRoot = () => {
  const configuredUploadRoot = process.env.UPLOAD_ROOT?.trim();

  return configuredUploadRoot
    ? path.resolve(configuredUploadRoot)
    : path.resolve(process.cwd(), "uploads");
};

export const persistImageDataUrl = async (
  value: unknown,
  directory: "products" | "promotions" | "stores",
  filenamePrefix: string,
) => {
  if (typeof value !== "string" || !value.startsWith("data:image/")) {
    return typeof value === "string" && value.trim() ? value : null;
  }

  const match = value.match(dataUrlPattern);
  if (!match) {
    return null;
  }

  const [, mimeType, base64Data] = match;
  if (!mimeType) {
    return null;
  }

  const uploadDir = path.join(getUploadRoot(), directory);
  await fs.mkdir(uploadDir, { recursive: true });

  const safePrefix = filenamePrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || directory;
  const filename = `${safePrefix}-${Date.now()}-${crypto.randomUUID()}.webp`;
  const filePath = path.join(uploadDir, filename);
  const optimization = imageOptimizationByDirectory[directory];
  const imageBuffer = Buffer.from(base64Data.replace(/\s/g, ""), "base64");

  if (imageBuffer.byteLength > MAX_UPLOAD_IMAGE_BYTES) {
    throw Object.assign(
      new Error(`Image is too large. Please upload an image smaller than ${formatUploadLimit(MAX_UPLOAD_IMAGE_BYTES)}.`),
      { status: 413 },
    );
  }

  const optimizedImageBuffer = await sharp(imageBuffer, { limitInputPixels: 36_000_000 })
    .rotate()
    .resize({
      width: optimization.maxWidth,
      height: optimization.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: optimization.quality,
      effort: 4,
    })
    .toBuffer();

  await fs.writeFile(filePath, optimizedImageBuffer);

  return `/uploads/${directory}/${filename}`;
};

export const removePersistedUpload = async (value: unknown) => {
  if (typeof value !== "string" || !value.startsWith("/uploads/")) {
    return;
  }

  const relativePath = value.replace(/^\/uploads\/+/, "");
  const uploadRoot = getUploadRoot();
  const filePath = path.resolve(uploadRoot, relativePath);

  if (!filePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn(`Failed to remove uploaded file ${filePath}:`, error);
    }
  }
};
