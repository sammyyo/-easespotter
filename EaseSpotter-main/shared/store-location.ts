import { z } from 'zod';

export const publicStoreLocationSchema = z.object({
  address: z.string().trim().max(500).default(''),
  latitude: z.number().finite().min(-90).max(90).nullable().default(null),
  longitude: z.number().finite().min(-180).max(180).nullable().default(null),
  published: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.published && (!value.address || value.latitude === null || value.longitude === null)) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ['address'], message: 'Add a complete address and both coordinates before publishing.'});
  }
});
export type PublicStoreLocation = z.infer<typeof publicStoreLocationSchema>;
export const emptyStoreLocation: PublicStoreLocation = {address: '', latitude: null, longitude: null, published: false};
