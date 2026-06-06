// components/MapPane.tsx
import React, { useMemo, useState, useEffect, useRef } from "react";

type MapPaneProps = {
  onContextChange?: (text: string) => void; // callback to send context up
  initialContext?: string;
};

/* --- helpers for bbox + zoom forcing (you already had these) --- */
function bboxAround(lat: number, lon: number, radiusMeters: number) {
  const dLat = radiusMeters / 111_320; // meters per degree lat
  const dLon = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { left: lon - dLon, right: lon + dLon, bottom: lat - dLat, top: lat + dLat };
}
function zoomRadius(zoom: number) {
  if (zoom >= 19) return 120;
  if (zoom >= 18) return 200;
  if (zoom >= 17) return 400;
  if (zoom >= 16) return 800;
  return 1200;
}

type GeoInfo = {
  name: string;
  type?: string;
  category?: string;
  address?: Record<string, string>;
  bbox?: [string, string, string, string];
};

const DEFAULT_LAT = 43.7615;
const DEFAULT_LNG = -79.4111;

export default function MapPane({ onContextChange, initialContext }: MapPaneProps) {
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [zoom, setZoom] = useState(15);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [info, setInfo] = useState<GeoInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Drawing state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [paths, setPaths] = useState<Array<{lat: number, lng: number}[]>>([]);
  const [currentPath, setCurrentPath] = useState<{lat: number, lng: number}[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // NEW: lock state
  const [locked, setLocked] = useState(false);
  const [rotation, setRotation] = useState(0);

  // Function to perform geocoding based on a query string
  const performSearch = async (query: string) => {
    if (isSearching || !query.trim()) return;
    setIsSearching(true);
    setStatus("Searching...");
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Search failed");

      setLat(data.lat);
      setLng(data.lon);
      setZoom(17);
      setStatus(data.name);
      setInfo({
        name: data.name,
        type: data.type,
        category: data.category,
        address: data.address,
        bbox: data.bbox
      });
    } catch (err: any) {
      setStatus(err?.message || "Search failed");
    } finally {
      setIsSearching(false);
      setTimeout(() => setStatus(null), 2200);
    }
  };

  // Handle external updates to the context (e.g. when clicking a saved chat)
  useEffect(() => {
    if (!initialContext || initialContext === infoText) return;
    
    const coordsMatch = initialContext.match(/Lat (-?\d+\.\d+), Lng (-?\d+\.\d+)/);
    if (coordsMatch) {
      setLat(parseFloat(coordsMatch[1]));
      setLng(parseFloat(coordsMatch[2]));
      setZoom(17);
    } else {
      // Treat as a search query if no coordinates are found in the string
      // Extract location if structured format is used (e.g. "LOCATION: ...")
      const locationLine = initialContext.split('\n')[0];
      const searchQuery = locationLine.startsWith('LOCATION:') 
        ? locationLine.replace('LOCATION:', '').trim() 
        : initialContext;

      performSearch(searchQuery);
      setQ(searchQuery);
    }
  }, [initialContext]);

  const src = useMemo(() => {
    const r = zoomRadius(zoom);
    const b = bboxAround(lat, lng, r);
    // Cache bounds for coordinate projection
    const v = `${lat.toFixed(5)}_${lng.toFixed(5)}_${zoom}`; // cache-buster so iframe reloads
    const qs = new URLSearchParams({
      layer: "mapnik",
      bbox: `${b.left},${b.bottom},${b.right},${b.top}`,
      marker: `${lat},${lng}`,
      v
    }).toString();
    const hash = `#map=${zoom}/${lat}/${lng}`;
    return `https://www.openstreetmap.org/export/embed.html?${qs}${hash}`;
  }, [lat, lng, zoom]);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) {
      setStatus("🔒 Map is locked");
      setTimeout(() => setStatus(null), 1400);
      return;
    }
    if (isSearching) return;

    const query = q.trim();
    if (!query) return;

    await performSearch(query);
  };

  const infoText = (() => {
    if (!info) return "";
    const parts: string[] = [];
    if (info.name) parts.push(info.name);
    if (info.type || info.category)
      parts.push(`(${info.category ?? ""}${info.category && info.type ? " • " : ""}${info.type ?? ""})`);
    if (info.address) {
      const a = info.address;
      const addrLine = [a.road, a.neighbourhood, a.city || a.town || a.village, a.state, a.postcode, a.country]
        .filter(Boolean)
        .join(", ");
      if (addrLine) parts.push(addrLine);
    }
    parts.push(`Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
    return parts.filter(Boolean).join("\n");
  })();

  // Sync the context back to the parent whenever it changes
  useEffect(() => {
    onContextChange?.(infoText);
  }, [infoText, onContextChange]);

  const handleZoomIn = () => {
    if (locked) return;
    setZoom((prev) => Math.min(prev + 1, 19));
  };

  const handleZoomOut = () => {
    if (locked) return;
    setZoom((prev) => Math.max(prev - 1, 0));
  };

  const handleLocate = () => {
    if (locked) return;
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported");
      setTimeout(() => setStatus(null), 2000);
      return;
    }

    setStatus("Locating...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setZoom(16);
        setStatus("Location found");
        setTimeout(() => setStatus(null), 2000);
      },
      () => {
        setStatus("Locate failed");
        setTimeout(() => setStatus(null), 2000);
      }
    );
  };

  // Helper to project screen coords to lat/lng
  const getLatLngFromEvent = (e: React.PointerEvent) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Get mouse pos relative to center to handle rotation
    const centerX = rect.width / 2;
    const centerY = 450 / 2; // Fixed map height
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Inverse rotate mouse coordinates
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);

    const relX = mouseX - centerX;
    const relY = mouseY - centerY;

    const x = relX * cos - relY * sin + centerX;
    const y = relX * sin + relY * cos + centerY;
    
    const r = zoomRadius(zoom);
    const b = bboxAround(lat, lng, r);
    
    const lngClicked = b.left + (x / rect.width) * (b.right - b.left);
    const latClicked = b.top - (y / 450) * (b.top - b.bottom);
    
    return { lat: latClicked, lng: lngClicked };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    const coords = getLatLngFromEvent(e);
    if (coords) setCurrentPath([coords]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingMode || !currentPath) return;
    const coords = getLatLngFromEvent(e);
    if (coords) setCurrentPath([...currentPath, coords]);
  };

  const handlePointerUp = () => {
    if (currentPath && currentPath.length > 1) {
      setPaths([...paths, currentPath]);
    }
    setCurrentPath(null);
  };

  // Convert lat/lng to SVG points
  const projectPath = (path: {lat: number, lng: number}[]) => {
    if (!containerRef.current) return "";
    const rect = containerRef.current.getBoundingClientRect();
    const r = zoomRadius(zoom);
    const b = bboxAround(lat, lng, r);

    return path.map(p => {
      const x = ((p.lng - b.left) / (b.right - b.left)) * rect.width;
      const y = ((b.top - p.lat) / (b.top - b.bottom)) * 450;
      return `${x},${y}`;
    }).join(" ");
  };

return (
  <div ref={containerRef} className="flex flex-col rounded-2xl border border-slate-200 shadow-xl overflow-hidden bg-slate-50 transition-shadow duration-300">
    {/* Map */}
    <div className="relative w-full h-[450px] overflow-hidden">
      {/* Compass / Reset North */}
      <button
        onClick={() => setRotation(0)}
        className="absolute top-4 right-4 z-40 p-2 bg-white/90 backdrop-blur rounded-full shadow-lg border border-slate-200 hover:bg-white transition-all active:scale-95 group"
        title="Reset to North"
      >
        <div 
          className="transition-transform duration-300 ease-out"
          style={{ transform: `rotate(${-rotation}deg)` }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15 8H9L12 2Z" fill="#EF4444" />
            <path d="M12 22L9 16H15L12 22Z" fill="#94A3B8" />
            <circle cx="12" cy="12" r="2" fill="#475569" />
          </svg>
        </div>
        {rotation !== 0 && (
          <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500 bg-white px-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            {((rotation % 360 + 360) % 360).toFixed(0)}°
          </span>
        )}
      </button>

      {/* Rotated Map Wrapper */}
      <div 
        className="w-full h-full transition-transform duration-300 ease-out"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
      {/* Drawing Overlay */}
      {(locked || isDrawingMode) && (
        <div
          className="absolute inset-0 z-20 cursor-not-allowed"
          style={{ 
            background: "transparent", 
            pointerEvents: "auto",
            cursor: isDrawingMode ? "crosshair" : "not-allowed" 
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <svg className="w-full h-[450px] pointer-events-none">
            {paths.map((path, i) => (
              <polyline
                key={i}
                points={projectPath(path)}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
            ))}
            {currentPath && (
              <polyline
                points={projectPath(currentPath)}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="5,5"
              />
            )}
          </svg>
        </div>
      )}

      <iframe
        key={src}
        title="Map"
        src={src}
        className="w-full h-[450px]"
        style={{ 
          border: 0,
          filter: locked ? "grayscale(0.5) contrast(0.8)" : "none",
          transition: "filter 0.3s ease"
        }}
        loading="eager"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
      </div>

      {/* Status toast - Absolute positioned to prevent layout jumps */}
      {status && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-full shadow-xl backdrop-blur-sm transition-all animate-in fade-in zoom-in duration-200">
          {status}
        </div>
      )}
    </div>

    {/* Controls: Lock + Search */}
    <div className="flex items-center gap-3 p-4 border-t border-slate-100 bg-white">
      <button
        type="button"
        onClick={() => setLocked(v => !v)}
        aria-pressed={locked}
        className={`px-4 py-2 rounded-xl shadow-sm border text-xs font-bold transition-all duration-200 ${
          locked ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
        }`}
        title={locked ? "Unlock map" : "Lock map"}
      >
        {locked ? "🔒 LOCKED" : "🔓 UNLOCKED"}
      </button>

      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setRotation(r => r - 15)}
          className="p-1.5 hover:bg-white rounded-lg transition-all text-slate-500"
          title="Rotate Left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setRotation(r => r + 15)}
          className="p-1.5 hover:bg-white rounded-lg transition-all text-slate-500"
          title="Rotate Right"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setIsDrawingMode(!isDrawingMode)}
          className={`p-2 rounded-lg transition-all ${
            isDrawingMode ? "bg-blue-600 text-white shadow-inner" : "text-slate-500 hover:bg-white"
          }`}
          title="Draw Mode"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        {paths.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setPaths([]);
              setCurrentPath(null);
            }}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
            title="Clear Drawings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={locked || zoom <= 0}
          className="p-1.5 hover:bg-white rounded-lg transition-all disabled:opacity-50 disabled:hover:bg-transparent"
          title="Zoom out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-[10px] font-bold w-4 text-center text-slate-500">{zoom}</span>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={locked || zoom >= 19}
          className="p-1.5 hover:bg-white rounded-lg transition-all disabled:opacity-50 disabled:hover:bg-transparent"
          title="Zoom in"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <form onSubmit={onSearch} className="flex items-center gap-2 flex-1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for a location..."
          className="outline-none text-sm w-full rounded-xl border border-slate-200 px-4 py-2 transition-all focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 bg-slate-50/50"
          disabled={locked}
        />
        <button
          type="submit"
          disabled={locked || isSearching}
          className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm min-w-[80px] ${
            (locked || isSearching) ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
          }`}
        >
          {isSearching ? "..." : "Search"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleLocate}
        disabled={locked}
        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50"
        title="My Location"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => {
          setLat(DEFAULT_LAT);
          setLng(DEFAULT_LNG);
          setZoom(15);
          setInfo(null);
          setQ("");
        }}
        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
        title="Reset Map"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>
    </div>

    {/* Info textbox */}
    <div className="p-4 border-t border-slate-100 bg-white">
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        Contextual Data
      </label>
      <textarea
        id="map-info-text"
        readOnly
        value={infoText}
        rows={3}
        className="w-full text-sm font-mono rounded-xl border border-slate-100 bg-slate-50/50 p-3 resize-none focus:outline-none"
      />
    </div>
  </div>
);

}
