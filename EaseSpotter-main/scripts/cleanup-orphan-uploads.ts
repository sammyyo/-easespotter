import fs from "fs/promises";
import path from "path";
import postgres from "postgres";
import { getUploadRoot } from "../server/image-storage";

const args = new Set(process.argv.slice(2));
const deleteFiles = args.has("--delete");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const uploadRoot = getUploadRoot();
const sql = postgres(process.env.DATABASE_URL);

const uploadPathnameFromUrl = (url: unknown) => {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }

  try {
    const pathname = url.startsWith("http://") || url.startsWith("https://")
      ? new URL(url).pathname
      : url;

    return pathname.startsWith("/uploads/") ? pathname : null;
  } catch {
    return null;
  }
};

const walkFiles = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  }));

  return files.flat();
};

const getReferencedUploadPathnames = async () => {
  const [products, promotions, storeProducts, storeProfiles] = await Promise.all([
    sql`select image_url from products where image_url is not null`,
    sql`select image_url from promotions where image_url is not null`,
    sql`select image_url from store_products where image_url is not null`,
    sql`select logo_url, banner_url from store_profiles where logo_url is not null or banner_url is not null`,
  ]);

  const urls = [
    ...products.map((row: any) => row.image_url),
    ...promotions.map((row: any) => row.image_url),
    ...storeProducts.map((row: any) => row.image_url),
    ...storeProfiles.flatMap((row: any) => [row.logo_url, row.banner_url]),
  ];

  return new Set(urls.map(uploadPathnameFromUrl).filter(Boolean) as string[]);
};

try {
  const referencedPathnames = await getReferencedUploadPathnames();
  const uploadFiles = await walkFiles(uploadRoot);
  const orphanFiles = uploadFiles.filter((filePath) => {
    const pathname = `/uploads/${path.relative(uploadRoot, filePath).split(path.sep).join("/")}`;
    return !referencedPathnames.has(pathname);
  });

  for (const filePath of orphanFiles) {
    console.log(`${deleteFiles ? "Deleting" : "Would delete"} ${filePath}`);
    if (deleteFiles) {
      await fs.unlink(filePath);
    }
  }

  console.log(JSON.stringify({
    deleteFiles,
    referencedCount: referencedPathnames.size,
    scannedFiles: uploadFiles.length,
    orphanCount: orphanFiles.length,
  }, null, 2));
} finally {
  await sql.end();
}
