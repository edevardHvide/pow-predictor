import { useState, useCallback } from "react";

interface LocateButtonProps {
  onLocate: (lat: number, lng: number) => void;
}

export default function LocateButton({ onLocate }: LocateButtonProps) {
  const [locating, setLocating] = useState(false);

  const locate = useCallback(() => {
    if (locating) return;
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocate(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          alert("Location access was denied.");
        } else {
          alert("Could not determine your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [locating, onLocate]);

  return (
    <button
      onClick={locate}
      title="Go to my location"
      className="absolute top-[calc(env(safe-area-inset-top)+3.5rem)] right-3 md:top-[calc(1rem+4rem)] md:right-4 z-10 w-11 h-11 md:w-14 md:h-14 rounded-full glass-panel flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform"
    >
      {locating ? (
        <svg
          width="22"
          height="22"
          className="md:w-7 md:h-7 animate-pulse"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      ) : (
        <svg
          width="22"
          height="22"
          className="md:w-7 md:h-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      )}
    </button>
  );
}
