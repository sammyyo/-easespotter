import { publicStoreLocationSchema } from '../shared/store-location';

export type StoreLocationRow = {
  vendorId: number;
  name: string | null;
  businessName: string;
  logoUrl: string | null;
  integrationSettings: unknown;
};

export function publicAddress(row: StoreLocationRow) {
  let settings = row.integrationSettings;
  if (typeof settings === 'string') {
    try { settings = JSON.parse(settings); } catch { return null; }
  }
  const parsed = publicStoreLocationSchema.safeParse((settings as any)?.publicLocation);
  if (!parsed.success || !parsed.data.published) return null;
  const location = parsed.data;
  return {
    id: row.vendorId + '-primary',
    storeId: row.vendorId,
    vendorId: row.vendorId,
    label: row.name || row.businessName,
    storeName: row.name || row.businessName,
    logoUrl: row.logoUrl,
    address: location.address,
    formattedAddress: location.address,
    latitude: location.latitude!,
    longitude: location.longitude!,
  };
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

export function nearestStores(rows: StoreLocationRow[], latitude: number, longitude: number, radiusKm: number, limit: number) {
  return rows.map(publicAddress).filter((value) => value !== null)
    .map((store) => ({...store!, distanceMeters: distanceMeters(latitude, longitude, store!.latitude, store!.longitude)}))
    .filter((store) => store.distanceMeters <= radiusKm * 1000)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.storeId - b.storeId)
    .slice(0, limit);
}
