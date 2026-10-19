export interface StoreSession {
  vendorId?: number;
  vendorName: string;
  logoUrl?: string;
  timestamp: string;
  storeId?: string;
}

export interface Bookmark {
  productId: number;
  name: string;
  location: string;
  storeName: string;
  price: string;
}

export interface UserData {
  sessions: StoreSession[];
  bookmarks: Bookmark[];
}

const userDatabase: Record<string, UserData> = {};

export default userDatabase;
