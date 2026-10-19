import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Barcode, ImageIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ProductDescriptionEditor } from "./ProductDescriptionEditor";
import { generateInternalBarcode } from "@/lib/barcodes";

const MAX_FILE_SIZE = 5000000; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];

const optionalSkuSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional()
);

// Schema for web store products (no aisle/shelf fields required)
const storeProductFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().trim().optional(),
  sku: optionalSkuSchema,
  barcode: z.string().trim().optional(),
  basePrice: z.union([
    z.string().min(1, "Base price is required").refine(
      (val) => !isNaN(Number(val)) && Number(val) > 0,
      "Must be a valid positive number"
    ),
    z.number().min(0.01, "Base price must be greater than 0")
  ]),
  currentStock: z.number().min(0, "Stock cannot be negative"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  imageUrl: z
    .any()
    .optional()
    .nullable()
    .refine(
      (files) => {
        // Skip validation for null, undefined, string (existing base64) or empty FileList
        if (files === null || files === undefined || typeof files === 'string' || (files instanceof FileList && files.length === 0)) {
          return true;
        }
        // Validate file size for new uploads
        return files?.[0]?.size <= MAX_FILE_SIZE;
      }, 
      "Max image size is 5MB"
    )
    .refine(
      (files) => {
        // Skip validation for null, undefined, string (existing base64) or empty FileList
        if (files === null || files === undefined || typeof files === 'string' || (files instanceof FileList && files.length === 0)) {
          return true;
        }
        // Validate file type for new uploads
        return ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type);
      },
      "Only .jpg, .jpeg, .png, .webp and .avif formats are supported"
    ),
});

type ProductFormValues = z.infer<typeof storeProductFormSchema>;

interface StoreProductFormProps {
  onSubmit: (values: ProductFormValues) => void;
  onDelete?: () => void;
  isLoading?: boolean;
  defaultValues?: Partial<ProductFormValues>;
  mode?: 'create' | 'edit';
  product?: any; // Allow product to be passed in edit mode
}

export function StoreProductForm({ onSubmit, onDelete, isLoading, defaultValues, mode = 'create', product }: StoreProductFormProps) {
  // Initialize previewUrl with the existing image if available
  const initialImage = product?.imageUrl ?? defaultValues?.imageUrl ?? null;
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImage as string);
  
  // Track if we're using an existing base64 image
  const hasExistingImage = !!product?.imageUrl || !!defaultValues?.imageUrl;
  const [isExistingImage, setIsExistingImage] = useState<boolean>(hasExistingImage);
  
  console.log("Using StoreProductForm - specialized for web stores");
  
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(storeProductFormSchema),
    defaultValues: {
      name: product?.name ?? defaultValues?.name ?? "",
      brand: product?.brand ?? defaultValues?.brand ?? "",
      sku: product?.sku ?? defaultValues?.sku ?? "",
      barcode: product?.barcode ?? defaultValues?.barcode ?? "",
      basePrice: product?.basePrice ?? defaultValues?.basePrice ?? "",
      currentStock: product?.currentStock ?? defaultValues?.currentStock ?? 0,
      description: product?.description ?? defaultValues?.description ?? "",
      category: product?.category ?? defaultValues?.category ?? "",
      imageUrl: product?.imageUrl ?? defaultValues?.imageUrl
    },
  });

  useEffect(() => {
    const nextImage = product?.imageUrl ?? defaultValues?.imageUrl ?? null;
    form.reset({
      name: product?.name ?? defaultValues?.name ?? "",
      brand: product?.brand ?? defaultValues?.brand ?? "",
      sku: product?.sku ?? defaultValues?.sku ?? "",
      barcode: product?.barcode ?? defaultValues?.barcode ?? "",
      basePrice: product?.basePrice ?? defaultValues?.basePrice ?? "",
      currentStock: product?.currentStock ?? defaultValues?.currentStock ?? 0,
      description: product?.description ?? defaultValues?.description ?? "",
      category: product?.category ?? defaultValues?.category ?? "",
      imageUrl: nextImage,
    });
    setPreviewUrl(nextImage as string | null);
    setIsExistingImage(!!nextImage);
  }, [defaultValues, form, product]);

  // Custom submit handler to handle both file uploads and existing base64 images
  const handleFormSubmit = (data: ProductFormValues) => {
    console.log("StoreProductForm submitted with image type:", typeof data.imageUrl);
    
    // If we're editing and using an existing image
    if (mode === 'edit' && isExistingImage) {
      console.log("Edit mode with existing image, preserving it");
      // Important: Always preserve the existing image in edit mode if it wasn't explicitly changed
      onSubmit({
        ...data,
        imageUrl: previewUrl
      });
      return;
    }
    
    // If we have a valid file to upload, we should already have a previewUrl from handleImageChange
    // So we can just use that instead of trying to read the file again here
    if (previewUrl && data.imageUrl instanceof FileList) {
      console.log("Using preview URL from earlier file upload");
      onSubmit({
        ...data,
        imageUrl: previewUrl
      });
    } else if (previewUrl) {
      // If we still have a preview but no FileList (happens sometimes)
      console.log("Using current preview image");
      onSubmit({
        ...data,
        imageUrl: previewUrl
      });
    } else {
      // No image at all
      console.log("No image in submission");
      onSubmit({
        ...data,
        imageUrl: undefined
      });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsExistingImage(false); // Now using a new file, not the existing image
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    form.setValue("imageUrl", undefined);
    setPreviewUrl(null);
    setIsExistingImage(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter product name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SKU <span className="text-muted-foreground">(optional)</span></FormLabel>
              <FormControl>
                <Input placeholder="Enter SKU if available" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="brand"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand <span className="text-muted-foreground">(optional)</span></FormLabel>
              <FormControl>
                <Input placeholder="Enter product brand" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="barcode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Barcode <span className="text-muted-foreground">(optional)</span></FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <Input placeholder="Scan or enter UPC/EAN/barcode" {...field} />
                </FormControl>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.setValue("barcode", generateInternalBarcode(), { shouldDirty: true })}
                >
                  <Barcode className="mr-2 h-4 w-4" />
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate one if the product has no manufacturer barcode, then print its label after saving.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="basePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base Price</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currentStock"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Stock</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    min="0" 
                    placeholder="0"
                    value={field.value || 0}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseInt(e.target.value);
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <Input placeholder="Enter category" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <ProductDescriptionEditor
                  value={field.value || ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field: { onChange, value, ...field } }) => (
            <FormItem>
              <FormLabel>Product Image</FormLabel>
              <FormControl>
                <div className="flex flex-col items-center gap-4">
                  {previewUrl ? (
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden">
                      <img
                        src={previewUrl}
                        alt="Product preview"
                        className="w-full h-full object-contain"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={clearImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="w-full aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 p-4 cursor-pointer"
                         onClick={() => document.getElementById('image-upload')?.click()}>
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                      <p className="text-sm text-gray-500">Click to upload product image</p>
                      <p className="text-xs text-gray-400">JPG, PNG, WebP, AVIF up to 5MB</p>
                    </div>
                  )}
                  <Input
                    id="image-upload"
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(',')}
                    className="hidden"
                    onChange={(e) => {
                      handleImageChange(e);
                      onChange(e.target.files);
                    }}
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (mode === 'create' ? "Creating..." : "Updating...") : (mode === 'create' ? "Create Product" : "Update Product")}
            </Button>
            {mode === 'edit' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete Product</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the product
                      and remove it from the system.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onDelete?.()}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}
