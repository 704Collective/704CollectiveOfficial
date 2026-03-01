'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface HomepageImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
}

export function HomepageImageGrid() {
  const [images, setImages] = useState<HomepageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchImages = async () => {
      const { data } = await supabase
        .from('homepage_images')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (data) setImages(data);
      setLoading(false);
    };
    fetchImages();
  }, []);

  const next = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % images.length);
  }, [images.length]);

  const prev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // Auto-advance every 4 seconds
  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % images.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [images.length]);

  if (loading) {
    return (
      <div className="w-full h-[50vh] md:h-[400px] bg-muted animate-pulse rounded-2xl" />
    );
  }

  if (images.length === 0) {
    return (
      <div className="w-full h-[50vh] md:h-[400px] rounded-2xl bg-gradient-to-br from-muted/50 to-muted/20 border border-border flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Event photos coming soon</p>
      </div>
    );
  }

  return (
    <div className="relative group w-full overflow-hidden">
      {/* Transform-based image strip */}
      <div
        className="flex w-full"
        style={{
          transform: `translateX(-${currentIndex * 100}%)`,
          transition: 'transform 800ms ease-in-out',
        }}
      >
        {images.map((image) => (
          <div
            key={image.id}
            className="w-full min-w-full h-[50vh] md:h-[400px] flex-shrink-0 relative"
          >
            <img
              src={image.image_url}
              alt={image.alt_text || "704 Collective community event"}
              loading="lazy"
              className="w-full h-full object-contain"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={prev}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 z-10",
              "bg-black/40 hover:bg-black/60 text-white rounded-full p-3",
              "transition-all",
              "md:opacity-0 md:group-hover:opacity-100",
            )}
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={next}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 z-10",
              "bg-black/40 hover:bg-black/60 text-white rounded-full p-3",
              "transition-all",
              "md:opacity-0 md:group-hover:opacity-100",
            )}
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all",
                  i === currentIndex
                    ? "bg-white scale-110"
                    : "bg-white/40 hover:bg-white/70"
                )}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
