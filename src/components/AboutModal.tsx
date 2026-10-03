import React from "react";
import { X, Shield, Cpu, Database, Satellite, Layers, CheckCircle2 } from "lucide-react";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in text-slate-800">
      <div className="bg-white border border-slate-200/80 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                ThermoGuard AI • Architecture &amp; System Dossier
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Smart India Hackathon 2026 | NTRO | PS ID: SIH26162
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Core Problem Statement */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
              The SIH 2026 Problem Statement
            </h3>
            <p className="text-slate-600 leading-relaxed">
              NASA FIRMS detects raw satellite thermal anomalies (FRP, brightness temperature). However, 
              <strong> a thermal hotspot is not automatically an industrial fire</strong>.
              Routine flaring at petrochemical refineries emits high thermal signatures continuously, while true industrial disasters (e.g. chemical tank breaches) require immediate crisis response. 
              ThermoGuard AI fuses satellite detections with OpenStreetMap infrastructure, ESA land-cover, and multi-temporal tracking to distinguish benign flaring, agricultural stubble burning, and wildfires from real industrial emergencies.
            </p>
          </div>

          {/* 4 Pillars Architecture */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                <Satellite className="w-4 h-4" />
                <span>1. Multi-Sensor FIRMS Ingestion</span>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">
                Integrates VIIRS 375m I-band and MODIS 1km satellite observations with calibrated FRP and brightness temperature.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-2 text-orange-700 font-bold text-xs">
                <Layers className="w-4 h-4" />
                <span>2. Geospatial Context Engine</span>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">
                Computes geodesic distances to OSM industrial facilities (refineries, chemical tanks, mines) and ESA WorldCover land-cover classes.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                <Database className="w-4 h-4" />
                <span>3. Temporal Behavior Engine</span>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">
                Tracks multi-day persistence, satellite revisit recurrence ratios, and sudden thermal onset vs long-duration flaring signatures.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-xs">
                <Cpu className="w-4 h-4" />
                <span>4. Random Forest &amp; Risk Scorer</span>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">
                Multi-class classification across 6 categories paired with transparent, explainable, non-hallucinatory physical evidence bullets.
              </p>
            </div>
          </div>

          {/* Target Classification Classes */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
            <span className="font-bold text-slate-700 uppercase text-xs tracking-wider block">
              Classification Hierarchy
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-red-50/70 border border-red-200 text-red-700">
                <strong className="block font-bold">Industrial Fire:</strong> Uncontrolled emergency event
              </div>
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-800">
                <strong className="block font-bold">Gas Flare:</strong> Routine refinery / petro flaring
              </div>
              <div className="p-3 rounded-xl bg-yellow-50/70 border border-yellow-200 text-yellow-800">
                <strong className="block font-bold">Agri Burning:</strong> Cropland post-harvest stubble
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-800">
                <strong className="block font-bold">Wildfire:</strong> Canopy forest biomass fire
              </div>
              <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 text-sky-800">
                <strong className="block font-bold">Mining:</strong> Coal seam spontaneous oxidation
              </div>
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
                <strong className="block font-bold">Other:</strong> Transient urban / brick kiln heat
              </div>
            </div>
          </div>

          {/* Data Mode & Real-time Integration Statement */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs space-y-1">
            <strong className="text-blue-800 font-bold uppercase tracking-wider block text-xs">Data Provenance Notice:</strong>
            <p className="text-slate-600 leading-relaxed">
              The current live dashboard runs on <strong>Calibrated Demo Data</strong> tailored to real coordinates (Jamnagar, Hazira, Sangrur, Simlipal, Korba).
              The backend architecture is built with abstract base classes (<code>FIRMSDataProvider</code>, <code>OSMDataProvider</code>) and can switch to live NASA FIRMS API key queries anytime via <code>.env</code>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>National Technical Research Organisation (NTRO)</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
