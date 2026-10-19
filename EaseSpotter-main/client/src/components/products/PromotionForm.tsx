import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@db/schema";
import { useState } from "react";
import { useCurrency } from "@/hooks/use-currency";
import { CalendarIcon, ImageIcon, X } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 5000000; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];

// Create a refined schema that properly validates the form fields
const promotionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  discountPercent: z.coerce.number().min(1, "Minimum discount is 1%").max(100, "Maximum discount is 100%"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  appliedProducts: z.array(z.number()).min(1, "Select at least one product for the promotion"),
  imageUrl: z
    .any()
    .optional()
    .nullable()
    .refine(
      (files) => {
        if (files === null || files === undefined || typeof files === "string" || (files instanceof FileList && files.length === 0)) {
          return true;
        }
        return files?.[0]?.size <= MAX_FILE_SIZE;
      },
      "Max image size is 5MB"
    )
    .refine(
      (files) => {
        if (files === null || files === undefined || typeof files === "string" || (files instanceof FileList && files.length === 0)) {
          return true;
        }
        return ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type);
      },
      "Only .jpg, .jpeg, .png, .webp and .avif formats are supported"
    ),
}).refine(
  (data) => {
    // Ensure end date is after start date
    if (!data.startDate || !data.endDate) return true;
    return new Date(data.endDate) > new Date(data.startDate);
  },
  {
    message: "End date must be after start date",
    path: ["endDate"],
  }
);

type PromotionFormData = z.infer<typeof promotionSchema>;

const toCalendarDate = (value?: string | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const toDateInputValue = (date?: Date) => date ? format(date, "yyyy-MM-dd") : "";

const formatCalendarValue = (value?: string | null) => {
  const date = toCalendarDate(value);
  return date ? format(date, "PPP") : null;
};

interface PromotionFormProps {
  onSubmit: (data: PromotionFormData) => void;
  isLoading?: boolean;
  defaultValues?: Partial<PromotionFormData>;
  isEdit?: boolean;
  promotionId?: number;
  promotion?: any; // Allow passing in promotion object directly
}

export function PromotionForm({ onSubmit, isLoading, defaultValues, isEdit = false, promotionId, promotion }: PromotionFormProps) {
  // Use either promotion or defaultValues to populate the form
  const values = promotion || defaultValues || {};
  const parseAppliedProductIds = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.map(Number).filter(Number.isFinite);
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
      } catch {
        return [];
      }
    }

    return [];
  };
  const appliedProductIds = parseAppliedProductIds(values.appliedProducts);
  const fallbackProductIds = Array.isArray(values.products)
    ? values.products.map((product: any) => Number(product.id)).filter(Number.isFinite)
    : [];
  const initialImage = values.imageUrl || null;
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImage);
  const [isExistingImage, setIsExistingImage] = useState<boolean>(!!initialImage);

  const { currency } = useCurrency();
  
  const form = useForm<PromotionFormData>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      name: values.name || "",
      discountPercent: values.discountPercent || 10,
      startDate: values.startDate || new Date().toISOString().split('T')[0],
      endDate: values.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      appliedProducts: appliedProductIds.length > 0 ? appliedProductIds : fallbackProductIds,
      imageUrl: values.imageUrl || undefined,
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsExistingImage(false);
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

  const handleFormSubmit = (data: PromotionFormData) => {
    if (isEdit && isExistingImage) {
      onSubmit({
        ...data,
        imageUrl: previewUrl,
      });
      return;
    }

    onSubmit({
      ...data,
      imageUrl: previewUrl || null,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Promotion Name</FormLabel>
              <FormControl>
                <Input placeholder="Summer Sale" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="discountPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Discount Percentage</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  min="1" 
                  max="100"
                  {...field}
                  onChange={e => field.onChange(parseInt(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {formatCalendarValue(field.value) || <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toCalendarDate(field.value)}
                      onSelect={(date) => field.onChange(toDateInputValue(date))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {formatCalendarValue(field.value) || <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toCalendarDate(field.value)}
                      onSelect={(date) => field.onChange(toDateInputValue(date))}
                      disabled={(date) => {
                        const startDate = toCalendarDate(form.watch("startDate"));
                        return startDate ? date < startDate : false;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field: { onChange, value, ...field } }) => (
            <FormItem>
              <FormLabel>Promotion Image</FormLabel>
              <FormControl>
                <div className="flex flex-col items-center gap-4">
                  {previewUrl ? (
                    <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden">
                      <img
                        src={previewUrl}
                        alt="Promotion preview"
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
                    <div
                      className="w-full aspect-[16/9] rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 p-4 cursor-pointer"
                      onClick={() => document.getElementById("promotion-image-upload")?.click()}
                    >
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                      <p className="text-sm text-gray-500">Click to upload promotion image</p>
                      <p className="text-xs text-gray-400">JPG, PNG, WebP, AVIF up to 5MB</p>
                    </div>
                  )}
                  <Input
                    id="promotion-image-upload"
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
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

        <FormField
          control={form.control}
          name="appliedProducts"
          render={({ field }) => (
            <FormItem className="border p-4 rounded-lg bg-background/50">
              <FormLabel className="text-lg font-semibold">
                Applied Products <span className="text-destructive">*</span>
              </FormLabel>
              <p className="text-sm text-muted-foreground mb-2">
                Select the products this promotion will apply to
              </p>
              <FormControl>
                <MultiSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={products.map(product => ({
                    value: product.id,
                    label: `${product.name} (${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.basePrice))})`
                  }))}
                  placeholder="Select products for this promotion"
                  className="min-h-[80px]"
                />
              </FormControl>
              {field.value && field.value.length > 0 && (
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <p className="text-sm font-medium">Selected products:</p>
                  <div className="flex flex-wrap gap-2">
                    {field.value.map(id => {
                      const product = products.find(p => p.id === id);
                      return product ? (
                        <div key={id} className="bg-primary/10 text-primary rounded px-2 py-1 text-sm">
                          {product.name}
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading 
            ? (isEdit ? "Updating..." : "Creating...") 
            : (isEdit ? "Update Promotion" : "Create Promotion")}
        </Button>
      </form>
    </Form>
  );
}
