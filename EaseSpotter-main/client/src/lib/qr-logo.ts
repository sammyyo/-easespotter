export const generateInitialsLogo = (name: string): string => {
  const initials = name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("") || "ES";

  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 100, 100);
  ctx.strokeStyle = "#6366f1";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 96, 96);
  ctx.fillStyle = "#6366f1";
  ctx.font = "bold 40px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, 50, 50);

  return canvas.toDataURL("image/png");
};

const DEFAULT_QR_LOGO_URL = "/logos/default-vendor.png";

const normalizeLogoUrl = (logoUrl?: string | null): string => {
  const value = logoUrl?.trim();

  if (!value || value.includes("/src/assets/") || value.includes("client/src/assets/")) {
    return DEFAULT_QR_LOGO_URL;
  }

  return value;
};

const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load logo image"));
    };

    image.src = url;
  });

export const createLogoDataUrl = async ({
  logoUrl,
  vendorName,
  size = 120,
  padding = 12,
}: {
  logoUrl?: string | null;
  vendorName: string;
  size?: number;
  padding?: number;
}): Promise<string> => {
  const normalizedLogoUrl = normalizeLogoUrl(logoUrl);
  const candidateLogoUrls = normalizedLogoUrl === DEFAULT_QR_LOGO_URL
    ? [DEFAULT_QR_LOGO_URL]
    : [normalizedLogoUrl, DEFAULT_QR_LOGO_URL];

  for (const candidateLogoUrl of candidateLogoUrls) {
    try {
      const response = await fetch(candidateLogoUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error("Failed to fetch logo");
      }

      const blob = await response.blob();
      const image = await loadImageFromBlob(blob);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        continue;
      }

      const radius = 16;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(size - radius, 0);
      ctx.quadraticCurveTo(size, 0, size, radius);
      ctx.lineTo(size, size - radius);
      ctx.quadraticCurveTo(size, size, size - radius, size);
      ctx.lineTo(radius, size);
      ctx.quadraticCurveTo(0, size, 0, size - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.fill();

      const maxSize = size - padding * 2;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const drawX = (size - drawWidth) / 2;
      const drawY = (size - drawHeight) / 2;

      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      return canvas.toDataURL("image/png");
    } catch (error) {
      continue;
    }
  }

  return generateInitialsLogo(vendorName);
};
