import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { Star, ShoppingCart, ArrowLeft, RefreshCw, Truck, ShieldCheck, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useCurrency } from "@/hooks/use-currency";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

interface ProductReview {
  id: number;
  authorName: string;
  rating: number;
  date: string;
  title: string;
  content: string;
  helpful: number;
  verified: boolean;
}

interface Product {
  id: number;
  name: string;
  storeId: number;
  basePrice: string;
  currentPrice: string;
  description: string;
  category?: string;
  imageUrl?: string;
  sku?: string;
  createdAt: string;
  updatedAt: string;
}

// Define the review form schema
const reviewFormSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  title: z.string().min(3, {
    message: "Title must be at least 3 characters.",
  }),
  rating: z.number().min(1).max(5, {
    message: "Please select a rating between 1 and 5 stars.",
  }),
  content: z.string().min(10, {
    message: "Review must be at least 10 characters.",
  }),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

export default function ProductDetail() {
  const { storeSlug, productSlug } = useParams();
  const { toast } = useToast();
  const { currency } = useCurrency();
  const [quantity, setQuantity] = useState(1);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  // Use state to manage reviews
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  
  // Extract the product ID from the slug (format: name-slug-{id})
  const productId = productSlug ? productSlug.split('-').pop() : '';

  // Initialize form
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      name: "",
      email: "",
      title: "",
      rating: 0,
      content: ""
    }
  });

  // Fetch product reviews from API
  const { data: fetchedReviews, isLoading: isLoadingReviews } = useQuery<ProductReview[]>({
    queryKey: [`/api/public/stores/${storeSlug}/products/${productId}/reviews`],
    queryFn: async () => {
      const response = await fetch(`/api/public/stores/${storeSlug}/products/${productId}/reviews`);
      if (!response.ok) {
        throw new Error("Failed to fetch product reviews");
      }
      return response.json();
    },
    enabled: !!productId && !!storeSlug,
  });

  // Set reviews from API when they are fetched
  useEffect(() => {
    if (fetchedReviews) {
      setReviews(fetchedReviews);
    }
  }, [fetchedReviews]);

  // Handle review submission
  const onSubmit = async (data: ReviewFormValues) => {
    setIsSubmittingReview(true);
    
    try {
      // Submit review to API
      const response = await fetch(`/api/public/stores/${storeSlug}/products/${productId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to submit review');
      }

      const newReview = await response.json();
      
      // Add the new review to the list
      setReviews(prevReviews => [newReview, ...prevReviews]);
      
      // Show success message
      toast({
        title: "Review submitted",
        description: "Thank you for your feedback!",
        variant: "default"
      });
      
      // Reset form
      form.reset({
        name: "",
        email: "",
        title: "",
        rating: 0,
        content: ""
      });
      
      // Reset selected rating
      setSelectedRating(0);
    } catch (error) {
      // Show error message
      toast({
        title: "Error",
        description: "Failed to submit your review. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };
  
  const { data: product, isLoading, error } = useQuery<Product>({
    queryKey: [`/api/public/stores/${storeSlug}/products/${productId}`],
    queryFn: async () => {
      const response = await fetch(`/api/public/stores/${storeSlug}/products/${productId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch product details");
      }
      return response.json();
    }
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load product details. Please try again.",
        variant: "destructive"
      });
    }
  }, [error, toast]);

  const handleAddToCart = () => {
    toast({
      title: "Added to cart",
      description: `${quantity} × ${product?.name} added to your cart`,
    });
  };

  // Calculate the rating average and total
  const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const totalReviews = reviews.length;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="md:w-1/2">
            <Skeleton className="w-full h-[400px] rounded-lg" />
          </div>
          <div className="md:w-1/2 space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-6 w-1/3" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="pt-4">
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-2xl font-bold">Product not found</h2>
        <p className="mt-2">Sorry, we couldn't find the product you're looking for.</p>
        <Link href={`/store/${storeSlug}`}>
          <Button className="mt-4" variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to store
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link href={`/store/${storeSlug}`}>
        <Button variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to store
        </Button>
      </Link>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Product Image */}
        <div className="md:w-1/2">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg h-[400px] flex items-center justify-center">
            {product.imageUrl ? (
              <img 
                src={product.imageUrl} 
                alt={product.name} 
                className="max-h-full max-w-full object-contain rounded-lg" 
              />
            ) : (
              <div className="text-center p-8">
                <RefreshCw className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                <p className="text-slate-500">No image available</p>
              </div>
            )}
          </div>
        </div>

        {/* Product Details */}
        <div className="md:w-1/2 space-y-4">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          
          {/* Rating */}
          <div className="flex items-center">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-5 w-5 ${
                    star <= averageRating
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-gray-300"
                  }`}
                />
              ))}
            </div>
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
              {averageRating.toFixed(1)} ({totalReviews} reviews)
            </span>
          </div>
          
          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.currentPrice))}
            </span>
            {Number(product.basePrice) > Number(product.currentPrice) && (
              <span className="text-lg text-gray-500 line-through">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(product.basePrice))}
              </span>
            )}
          </div>
          
          {/* Description */}
          <div className="text-gray-600 dark:text-gray-300">
            {(() => {
              const maxLength = 250; // Characters to show before truncating
              const description = product.description || '';
              const isLongDescription = description.length > maxLength;
              
              // Function to handle line breaks in the description
              const formatDescription = (text: string, truncate = false) => {
                // Split by line breaks and join with <br/> tags
                const paragraphs = text
                  .split('\n')
                  .filter(para => para.trim() !== '');
                
                if (truncate && isLongDescription) {
                  // Join only the first part and add ellipsis
                  return paragraphs.map((para, idx) => {
                    // Only show part of the first paragraph if it's too long
                    if (idx === 0 && para.length > maxLength) {
                      return <p key={idx}>{para.substring(0, maxLength)}...</p>;
                    } 
                    // Show full paragraphs until we reach the character limit
                    else if (idx < 2) {
                      return <p key={idx} className="mb-2">{para}</p>;
                    }
                    return null;
                  });
                }
                
                // Show all paragraphs with proper spacing
                return paragraphs.map((para, idx) => (
                  <p key={idx} className="mb-2">{para}</p>
                ));
              };
              
              return (
                <>
                  <div className={`description-content ${isDescriptionExpanded ? 'expanded' : 'truncated'}`}>
                    {formatDescription(description, !isDescriptionExpanded)}
                  </div>
                  
                  {isLongDescription && (
                    <button 
                      onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      className="flex items-center text-primary hover:underline mt-2 font-medium"
                    >
                      {isDescriptionExpanded ? (
                        <>
                          Show less <span className="ml-1">▲</span>
                        </>
                      ) : (
                        <>
                          Show more <span className="ml-1">▼</span>
                        </>
                      )}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
          
          {/* SKU and Category */}
          <div className="flex flex-col gap-1 text-sm text-gray-500 dark:text-gray-400">
            {product.sku && <p>SKU: {product.sku}</p>}
            {product.category && <p>Category: {product.category}</p>}
          </div>
          
          {/* Quantity Selector */}
          <div className="flex items-center gap-4 pt-4">
            <span>Quantity:</span>
            <div className="flex items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                -
              </Button>
              <span className="w-12 text-center">{quantity}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(quantity + 1)}
              >
                +
              </Button>
            </div>
          </div>
          
          {/* Add to Cart Button */}
          <Button 
            className="w-full mt-4" 
            size="lg"
            onClick={handleAddToCart}
          >
            <ShoppingCart className="mr-2 h-5 w-5" />
            Add to Cart
          </Button>
          
          {/* Product Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-4">
            <div className="flex items-center gap-2 text-sm">
              <Truck className="h-4 w-4 text-blue-500" />
              <span>Free Shipping</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw className="h-4 w-4 text-blue-500" />
              <span>30-Day Returns</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <span>Quality Guarantee</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <span>24/7 Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="mt-16 mb-8">
        <h2 className="text-2xl font-bold mb-6">Customer Reviews</h2>
        
        <div className="grid grid-cols-1 gap-6">
          {reviews.length > 0 ? (
            reviews.map((review) => (
              <Card key={review.id}>
                <CardHeader>
                  <div className="flex justify-between">
                    <div>
                      <CardTitle className="text-lg">{review.title}</CardTitle>
                      <div className="flex items-center mt-1">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= review.rating
                                  ? "text-yellow-500 fill-yellow-500"
                                  : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-sm text-gray-500">
                          {review.verified && "Verified Purchase"}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(review.date).toLocaleDateString()}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-300">{review.content}</p>
                </CardContent>
                <CardFooter className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">By {review.authorName}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{review.helpful} people found this helpful</span>
                    <Button variant="outline" size="sm">Helpful</Button>
                  </div>
                </CardFooter>
              </Card>
            ))
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium mb-2">No reviews yet</h3>
              <p className="text-gray-500">Be the first to share your thoughts about this product!</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Write a Review Form */}
      <div className="mt-12 pb-8 border-t pt-8">
        <h2 className="text-2xl font-bold mb-6">Write a Review</h2>
        
        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="your.email@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Review Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Summarize your experience" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="rating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rating</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-6 w-6 cursor-pointer ${
                                star <= (selectedRating || field.value || 0)
                                  ? "text-yellow-500 fill-yellow-500"
                                  : "text-gray-300"
                              }`}
                              onClick={() => {
                                setSelectedRating(star);
                                field.onChange(star);
                              }}
                              onMouseEnter={() => setSelectedRating(star)}
                              onMouseLeave={() => setSelectedRating(field.value || 0)}
                            />
                          ))}
                          <span className="ml-2 text-sm text-gray-500">
                            {selectedRating === 1 && "Poor"}
                            {selectedRating === 2 && "Fair"}
                            {selectedRating === 3 && "Average"}
                            {selectedRating === 4 && "Good"}
                            {selectedRating === 5 && "Excellent"}
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Review</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Share your experience with this product" 
                          className="min-h-[120px]" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full md:w-auto" 
                  disabled={isSubmittingReview}
                >
                  {isSubmittingReview ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Submit Review
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}