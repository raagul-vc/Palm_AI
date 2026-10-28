import React, { useState, useEffect, useRef } from "react";
import { Sprout, ImageOff } from "lucide-react";

/**
 * Robust PlantationImage Component
 * - Displays authentic oil-palm photography with object-fit: cover and rounded corners.
 * - Gracefully falls back to a designed plantation placeholder if image fails to load.
 * - Prevents broken image icons and container clipping.
 */
export default function PlantationImage({
  src,
  fallbackSrc,
  alt = "Oil Palm Plantation",
  className = "",
  style = {},
  aspectRatio = "auto",
  height,
  width = "100%",
  badge,
  caption,
  subcaption,
}) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (imgRef.current && (imgRef.current.complete || imgRef.current.naturalWidth > 0)) {
      setIsLoaded(true);
    }
  }, [src]);

  const containerStyle = {
    position: "relative",
    width,
    height: height || "100%",
    aspectRatio: aspectRatio !== "auto" ? aspectRatio : undefined,
    overflow: "hidden",
    borderRadius: "12px",
    backgroundColor: "#061a10",
    ...style,
  };

  return (
    <div className={`plantation-img-container ${className}`} style={containerStyle}>
      {!hasError ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`plantation-img ${isLoaded ? "loaded" : "loading"}`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
            transition: "opacity 0.2s ease, transform 0.3s ease",
            opacity: isLoaded ? 1 : 0.85,
          }}
          onLoad={() => setIsLoaded(true)}
          onError={(e) => {
            if (fallbackSrc && src !== fallbackSrc) {
              e.currentTarget.src = fallbackSrc;
            } else {
              setHasError(true);
            }
          }}
        />
      ) : (
        <div className="plantation-img-placeholder">
          <div className="placeholder-icon-wrap">
            <Sprout size={24} className="text-emerald" />
          </div>
          <span className="placeholder-title">{alt || "Oil-Palm Plantation"}</span>
          <span className="placeholder-sub">Commercial Stand Reference · Elaeis guineensis</span>
        </div>
      )}

      {/* Decorative gradient overlay if caption or badge is present */}
      {(badge || caption) && (
        <div className="plantation-img-overlay">
          {badge && <span className="plantation-overlay-badge">{badge}</span>}
          {caption && (
            <div className="plantation-overlay-text">
              <strong className="overlay-heading">{caption}</strong>
              {subcaption && <span className="overlay-sub">{subcaption}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
