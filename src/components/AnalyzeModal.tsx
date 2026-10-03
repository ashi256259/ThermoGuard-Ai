import React, { useState } from "react";
import { X, Flame, ShieldAlert, Sparkles, Navigation } from "lucide-react";
import { HotspotRecord } from "../types";

interface AnalyzeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHotspotCreated: (newHotspot: HotspotRecord) => void;
}

export const AnalyzeModal: React.FC<AnalyzeModalProps> = ({
  isOpen,
  onClose,
  onHotspotCreated,
}) => {
  const [lat, setLat] = useState<string>("22.3595");
  const [lon, setLon] = useState<string>("69.8648");
  const [brightness, setBrightness] = useState<string>("372.0");
  const [frp, setFrp] = useState<string>("65.0");
  const [confidence, setConfidence] = useState<string>("95.0");
  const [satellite, setSatellite] = useState<string>("VIIRS_SNPP");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
          brightness: parseFloat(brightness),
          frp: parseFloat(frp),
          confidence: parseFloat(confidence),
          satellite,
        }),
      });

      if (!res.ok) {
        throw new Error(`Pipeline execution failed: ${res.statusText}`);
      }

      const analyzedHotspot: HotspotRecord = await res.json();
      onHotspotCreated(analyzedHotspot);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to analyze thermal event");
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyPreset = (pLat: string, pLon: string, pB: string, pF: string) => {
    setLat(pLat);
    setLon(pLon);
    setBrightness(pB);
    setFrp(pF);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/50 backdrop-blur-xs animate-fade-in text-slate-800">
      <div className="bg-white border border-slate-200/80 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shadow-2xs flex-shrink-0">
              <Flame className="w-4 sm:w-5 h-4 sm:h-5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                On-Demand Hotspot Classification
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                Execute geospatial + temporal + Random Forest pipeline on custom coordinates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 text-xs overflow-y-auto flex-1">
          {/* Presets Bar */}
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-2 uppercase tracking-wider">Quick Test Presets:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPreset("22.3591", "69.8652", "375.0", "58.0")}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl border border-amber-200 text-xs font-semibold transition cursor-pointer"
              >
                Jamnagar Flare
              </button>
              <button
                type="button"
                onClick={() => applyPreset("21.1145", "72.6732", "398.0", "155.0")}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl border border-red-200 text-xs font-semibold transition cursor-pointer"
              >
                Hazira Explosion
              </button>
              <button
                type="button"
                onClick={() => applyPreset("30.2451", "75.8341", "330.0", "26.0")}
                className="px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 rounded-xl border border-yellow-200 text-xs font-semibold transition cursor-pointer"
              >
                Punjab Crop Field
              </button>
              <button
                type="button"
                onClick={() => applyPreset("21.8450", "86.3210", "360.0", "95.0")}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200 text-xs font-semibold transition cursor-pointer"
              >
                Simlipal Forest
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-xs">Latitude (°N)</label>
              <input
                type="number"
                step="0.0001"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3.5 py-2 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 font-mono transition"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-xs">Longitude (°E)</label>
              <input
                type="number"
                step="0.0001"
                required
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3.5 py-2 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 font-mono transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-xs">Brightness (K)</label>
              <input
                type="number"
                step="0.1"
                required
                value={brightness}
                onChange={(e) => setBrightness(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 font-mono transition"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-xs">FRP (MW)</label>
              <input
                type="number"
                step="0.1"
                required
                value={frp}
                onChange={(e) => setFrp(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 font-mono transition"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-xs">Confidence (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 font-mono transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1 text-xs">Sensor / Satellite</label>
            <select
              value={satellite}
              onChange={(e) => setSatellite(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3.5 py-2 rounded-xl focus:bg-white focus:outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="VIIRS_SNPP">VIIRS SNPP (375m high-res I-band)</option>
              <option value="VIIRS_NOAA20">VIIRS NOAA-20 (375m)</option>
              <option value="MODIS_Aqua">MODIS Aqua (1km)</option>
              <option value="MODIS_Terra">MODIS Terra (1km)</option>
            </select>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
              {errorMsg}
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? "Running Pipeline..." : "Execute ML Analysis"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
