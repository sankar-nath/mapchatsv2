import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const q = (req.query.q as string)?.trim();
  if (!q) return res.status(400).json({ error: "Missing q" });

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `format=jsonv2&limit=1&addressdetails=1&namedetails=1&extratags=1&` +
      `q=${encodeURIComponent(q)}`;

    const r = await fetch(url, {
      headers: { "User-Agent": "MapChatApp/1.0 (contact: zanky9@gmail.com)" }
    });

    if (!r.ok) return res.status(r.status).json({ error: await r.text() });

    const results = await r.json();
    if (!results?.length) return res.status(404).json({ error: "No results" });

    const item = results[0];
    res.status(200).json({
  lat: parseFloat(item.lat),
  lon: parseFloat(item.lon),
  name: item.display_name,
  type: item.type,
  category: item.class,
  address: item.address,
  bbox: item.boundingbox,
  namedetails: item.namedetails,   // multilingual names
  extratags: item.extratags,       // metadata like website, wikipedia, opening_hours
  osm_id: item.osm_id,             // unique OSM ID
  osm_type: item.osm_type,         // node/way/relation
  importance: item.importance,     // relative importance
  place_rank: item.place_rank      // rank scale
});

  console.log("Geocode result:", item);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Geocode failed" });
  }
}
