export interface StoreData {
  storeId: string;
  vendorName: string;
  logoUrl: string;
  totalProducts: number;
  timestamp: string;
  productsByCategory: Record<string, any[]>;
  productsByAisle: Record<string, any[]>;
}

const storeDatabase: Record<string, StoreData> = {
  abc123: {
    storeId: 'abc123',
    vendorName: 'ShafN',
    logoUrl: 'https://example.com/logo.png',
    totalProducts: 6,
    timestamp: '2025-04-09T16:45:50.444Z',
    productsByCategory: {
      Soda: [
        {
          id: 1,
          name: 'Coca Cola',
          price: '2.50',
          location: { aisle: '15', shelf: '98' },
          vendor: 'ShafN'
        }
      ],
      Electronics: [
        {
          id: 2,
          name: 'Wireless Headphones',
          price: '59.99',
          location: { aisle: '4', shelf: '12' },
          vendor: 'ShafN'
        }
      ]
    },
    productsByAisle: {
      '15': [
        { id: 1, name: 'Coca Cola', price: '2.50', shelf: '98', category: 'Soda' }
      ],
      '4': [
        { id: 2, name: 'Wireless Headphones', price: '59.99', shelf: '12', category: 'Electronics' }
      ]
    }
  },
  xyz789: {
    storeId: 'xyz789',
    vendorName: 'DemoMart',
    logoUrl: 'https://example.com/demomart.png',
    totalProducts: 3,
    timestamp: '2025-04-10T11:20:00.000Z',
    productsByCategory: {
      Books: [
        {
          id: 10,
          name: 'Learn TypeScript',
          price: '29.99',
          location: { aisle: '8', shelf: '5' },
          vendor: 'DemoMart'
        }
      ]
    },
    productsByAisle: {
      '8': [
        { id: 10, name: 'Learn TypeScript', price: '29.99', shelf: '5', category: 'Books' }
      ]
    }
  }
};

export default storeDatabase;
