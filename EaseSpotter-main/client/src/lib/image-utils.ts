import DefaultImage from "../assets/EaseSpotter.png";

/**
 * Image optimization utilities for EaseSpotter
 */

/**
 * Compresses and optimizes an image file
 * @param file The image file to optimize
 * @param maxWidth Maximum width of the image
 * @param maxHeight Maximum height of the image
 * @param quality Compression quality (0-1)
 * @param format Output format (webp preferred for best compression)
 * @returns A Promise resolving to the optimized file
 */
export async function optimizeImage(
  file: File,
  maxWidth: number = 800,
  maxHeight: number = 800,
  quality: number = 0.8,
  format: 'webp' | 'jpeg' | 'png' = 'webp'
): Promise<File> {
  return new Promise((resolve, reject) => {
    // Create image element to load the file
    const img = new Image();
    img.onload = () => {
      // Create canvas for resizing/compressing
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate new dimensions while maintaining aspect ratio
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      
      if (height > maxHeight) {
        width = Math.round(width * (maxHeight / height));
        height = maxHeight;
      }
      
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;
      
      // Draw image on canvas with new dimensions
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Use better quality settings for the rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to selected format with specified quality
      let mimeType: string;
      switch (format) {
        case 'webp':
          mimeType = 'image/webp';
          break;
        case 'jpeg':
          mimeType = 'image/jpeg';
          break;
        case 'png':
          mimeType = 'image/png';
          break;
        default:
          mimeType = 'image/webp';
      }
      
      // Convert canvas to blob with quality setting
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob from canvas'));
            return;
          }
          
          // Create a new file from the blob
          const optimizedFile = new File(
            [blob],
            `optimized-${file.name.split('.')[0]}.${format}`,
            { type: mimeType }
          );
          
          console.log(
            `Image optimized: ${(file.size / 1024).toFixed(2)}KB → ${(optimizedFile.size / 1024).toFixed(2)}KB`
          );
          
          resolve(optimizedFile);
        },
        mimeType,
        quality
      );
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Load the image from file
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Validates an image file size
 * @param file The image file to validate
 * @param maxSizeKB Maximum allowed size in KB
 * @returns true if valid, false if too large
 */
export function validateImageSize(file: File, maxSizeKB: number): boolean {
  const fileSizeKB = file.size / 1024;
  return fileSizeKB <= maxSizeKB;
}

// Create a helper function to add overlay effects to images without using JSX
export function createOptimizedImageElement(url: string, alt: string, className: string): HTMLElement {
  // Create container div
  const container = document.createElement('div');
  container.className = 'relative';
  
  // Create placeholder/loader div
  const placeholder = document.createElement('div');
  placeholder.className = 'absolute inset-0 bg-gray-100 animate-pulse';
  placeholder.style.opacity = '1';
  placeholder.style.transition = 'opacity 0.3s ease-in-out';
  
  // Create image element
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt;
  img.className = `${className} relative z-10`;
  img.style.opacity = '1';
  img.style.transition = 'opacity 0.3s ease-in-out';
  img.setAttribute('loading', 'lazy');
  
  // Add event listeners
  img.onload = () => {
    // Hide placeholder when image loads
    placeholder.style.opacity = '0';
  };
  
  img.onerror = () => {
    console.error("Error loading image:", url);
    img.onerror = null; // avoid infinite loop
    // Set fallback image
    img.src = DefaultImage;
    img.alt = "Default Image";
    // Hide placeholder on error too
    placeholder.style.opacity = '0';
  };
  
  // Assemble the elements
  container.appendChild(placeholder);
  container.appendChild(img);
  
  return container;
}