import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Threebox } from 'threebox-plugin';

import 'mapbox-gl/dist/mapbox-gl.css';



export interface MapContext {
  lat: number;
  lng: number;
  location?: string;
  details?: string;
}

interface MapPaneProps {
  initialContext?: string | MapContext;
  onContextChange?: (context: any) => void;
}

const MapboxExample = ({ initialContext, onContextChange }: MapPaneProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [view, setView] = useState('map');

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let lat = 8.57322;
    let lng = 76.87721;

    if (typeof initialContext === 'string') {
      const coordsMatch = initialContext.match(/Lat (-?\d+\.\d+), Lng (-?\d+\.\d+)/);
      if (coordsMatch) {
        lat = parseFloat(coordsMatch[1]);
        lng = parseFloat(coordsMatch[2]);
      }
    } else if (initialContext && typeof initialContext === 'object') {
      lat = (initialContext as MapContext).lat;
      lng = (initialContext as MapContext).lng;
    }

    console.log('lat and long are:', lat, lng);
    console.log('mapcontext or initialcontext is', initialContext);

    const map = new mapboxgl.Map({
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
      container: mapContainerRef.current,
      boxZoom: true,
      style: 'mapbox://styles/mapbox/standard',
      config: {
        basemap: {
          theme: 'faded',
          lightPreset: "day",
          show3dObjects: true // turn off Mapbox 3D buildings
        }
      },
      center: [lng, lat],
      maxBounds: [[lng - 0.01, lat - 0.01], [lng + 0.01, lat + 0.01]],
      zoom: 15.4,
      pitch: 64.9,
      bearing: 172.5,
      antialias: true
    });
    mapRef.current = map;

    map.on('style.load', () => {
      map.addLayer({
        id: 'custom-threebox-model',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function () {
          window.tb = new Threebox(
            map,
            map.getCanvas().getContext('webgl'),
            { defaultLights: true }
          );
          const scale = 5.2;
          const options = {
            obj: 'https://docs.mapbox.com/mapbox-gl-js/assets/metlife-building.gltf',
            type: 'gltf',
            scale: { x: scale, y: scale, z: 2.7 },
            units: 'meters',
            rotation: { x: 90, y: -90, z: 0 }
          };

          window.tb.loadObj(options, (model) => {
            model.setCoords([lng, lat]);
            model.setRotation({ x: 0, y: 0, z: 241 });
            window.tb.add(model);
          });
        },

        render: function () {
          window.tb.update();
        }
      });
    });

    return () => {
      if (mapRef.current) mapRef.current.remove();
    };
  }, [initialContext]);

  useEffect(() => {
    if (view === 'map' && mapRef.current) {
      mapRef.current.resize();
    }
  }, [view]);

  return (
    <div className="flex flex-col w-full h-full relative">
      {/* Toggle Buttons */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => setView('map')}
          className={`px-4 py-2 rounded-lg shadow-lg font-bold text-xs transition-all ${
            view === 'map' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          MAP
        </button>
        <button
          onClick={() => setView('3d')}
          className={`px-4 py-2 rounded-lg shadow-lg font-bold text-xs transition-all ${
            view === '3d' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          3D
        </button>
      </div>

      <div 
        id="map" 
        ref={mapContainerRef} 
        style={{ height: '100%', display: view === 'map' ? 'block' : 'none' }} 
        className="w-full"
      />

      <div 
        id="splat" 
        style={{ height: '100%', display: view === '3d' ? 'block' : 'none' }}
        className="w-full h-full"
      >
        <iframe
          id="viewer"
          title="3d"
          src="https://superspl.at/s?id=91c1e47e"
          className="w-full h-full border-0"
          allow="fullscreen; xr-spatial-tracking"
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default MapboxExample;