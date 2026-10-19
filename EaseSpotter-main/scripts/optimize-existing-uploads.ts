import fs from "fs/promises";
import path from "path";
import postgres from "postgres";
import sharp from "sharp";
import { getUploadRoot } from "../server/image-storage";

type ImageReference = {
  table: string;
  column: string;
  id: number;
  url: string;
};

const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const deleteOriginals = args.has("--delete-originals");
const minBytes = Number(process.env.OPTIMIZE_EXISTING_MIN_BYTES || 250 * 1024);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const uploadRoot = getUploadRoot();
const sql = postgres(process.env.DATABASE_URL);

const uploadPathFromUrl = (url: string) => {
  try {
    const pathname = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url).pathname
      : url;

    if (!pathname.startsWith("/uploads/")) {
      return null;
    }

    const relativePath = pathname.replace(/^\/uploads\/+/, "");
    const filePath = path.resolve(uploadRoot, relativePath);

    if (!filePath.startsWith(`${uploadRoot}${path.sep}`)) {
      return null;
    }

    return { pathname, filePath, relativePath };
  } catch {
    return null;
  }
};

const replacementUrl = (originalUrl: string, nextPathname: string) => {
  if (!originalUrl.startsWith("http://") && !originalUrl.startsWith("https://")) {
    return nextPathname;
  }

  const url = new URL(originalUrl);
  url.pathname = nextPathname;
  return url.toString();
};

const getReferences = async (): Promise<ImageReference[]> => {
  const [products, promotions, storeProducts, storeProfiles] = await Promise.all([
    sql`select id, image_url from products where image_url is not null`,
    sql`select id, image_url from promotions where image_url is not null`,
    sql`select id, image_url from store_products where image_url is not null`,
    sql`select id, logo_url, banner_url from store_profiles where logo_url is not null or banner_url is not null`,
  ]);

  return [
    ...products.map((row: any) => ({ table: "products", column: "image_url", id: row.id, url: row.image_url })),
    ...promotions.map((row: any) => ({ table: "promotions", column: "image_url", id: row.id, url: row.image_url })),
    ...storeProducts.map((row: any) => ({ table: "store_products", column: "image_url", id: row.id, url: row.image_url })),
    ...storeProfiles.flatMap((row: any) => [
      row.logo_url ? { table: "store_profiles", column: "logo_url", id: row.id, url: row.logo_url } : null,
      row.banner_url ? { table: "store_profiles", column: "banner_url", id: row.id, url: row.banner_url } : null,
    ].filter(Boolean) as ImageReference[]),
  ];
};

const updateReference = async (reference: ImageReference, nextUrl: string) => {
  if (reference.table === "products") {
    await sql`update products set image_url = ${nextUrl}, updated_at = now() where id = ${reference.id}`;
  } else if (reference.table === "promotions") {
    await sql`update promotions set image_url = ${nextUrl}, updated_at = now() where id = ${reference.id}`;
  } else if (reference.table === "store_products") {
    await sql`update store_products set image_url = ${nextUrl}, updated_at = now() where id = ${reference.id}`;
  } else if (reference.table === "store_profiles" && reference.column === "logo_url") {
    await sql`update store_profiles set logo_url = ${nextUrl}, updated_at = now() where id = ${reference.id}`;
  } else if (reference.table === "store_profiles" && reference.column === "banner_url") {
    await sql`update store_profiles set banner_url = ${nextUrl}, updated_at = now() where id = ${reference.id}`;
  }
};

let optimizedCount = 0;
let skippedCount = 0;
let missingCount = 0;

try {
  const references = await getReferences();

  for (const reference of references) {
    const uploadPath = uploadPathFromUrl(reference.url);
    if (!uploadPath) {
      skippedCount += 1;
      continue;
    }

    let stat;
    try {
      stat = await fs.stat(uploadPath.filePath);
    } catch {
      missingCount += 1;
      console.warn(`Missing file for ${reference.table}.${reference.column}#${reference.id}: ${reference.url}`);
      continue;
    }

    if (uploadPath.filePath.endsWith(".webp") && stat.size < minBytes) {
      skippedCount += 1;
      continue;
    }

    const parsedPath = path.parse(uploadPath.filePath);
    const nextFilePath = path.join(parsedPath.dir, `${parsedPath.name}-optimized-${Date.now()}.webp`);
    const nextPathname = `/uploads/${path.relative(uploadRoot, nextFilePath).split(path.sep).join("/")}`;
    const nextUrl = replacementUrl(reference.url, nextPathname);

    console.log(`${applyChanges ? "Optimizing" : "Would optimize"} ${reference.table}.${reference.column}#${reference.id}: ${reference.url} -> ${nextUrl}`);

    if (applyChanges) {
      await sharp(uploadPath.filePath, { limitInputPixels: 36_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(nextFilePath);
      await updateReference(reference, nextUrl);

      if (deleteOriginals) {
        await fs.unlink(uploadPath.filePath);
      }
    }

    optimizedCount += 1;
  }

  console.log(JSON.stringify({ applyChanges, deleteOriginals, optimizedCount, skippedCount, missingCount }, null, 2));
} finally {
  await sql.end();
}
