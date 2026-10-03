import React, { useState, useEffect } from "react";
import { X, Play, Compass, CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";
import { DemoScenario } from "../types";

interface ScenarioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScenario: (scenario: DemoScenario) => void;
  activeScenarioId?: string;
}

export const ScenarioDrawer: React.FC<ScenarioDrawerProps> = ({
  isOpen,
  onClose,
  onSelectScenario,
  activeScenarioId,
}) => {
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((res) => res.json())
      .then((data) => setScenarios(data))
      .catch(() => setScenarios([]));
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in text-slate-800">
      <div className="bg-white border border-slate-200/80 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Smart India Hackathon 2026 Validation Scenarios
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Problem Statement SIH26162: Distinguishing industrial fires from routine flares and biomass burns.
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

        {/* Scenarios List */}
        <div className="p-5 overflow-y-auto space-y-3">
          {scenarios.map((sc) => {
            const isActive = activeScenarioId === sc.id;
            return (
              <div
                key={sc.id}
                className={`p-4 rounded-xl border transition cursor-pointer ${
                  isActive
                    ? "bg-blue-50/40 border-blue-500 shadow-2xs"
                    : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
                }`}
                onClick={() => {
                  onSelectScenario(sc);
                  onClose();
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-sm text-slate-900">{sc.name}</span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          sc.risk === "CRITICAL"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : sc.risk === "HIGH"
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : sc.risk === "MEDIUM"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {sc.risk} RISK
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{sc.description}</p>
                    <div className="bg-slate-50 p-2.5 rounded-lg text-xs text-slate-600 border border-slate-200/60">
                      <strong className="text-blue-700">Key Insight:</strong> {sc.key_insight}
                    </div>
                  </div>

                  <button className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl transition shrink-0 mt-0.5 cursor-pointer shadow-xs">
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>NTRO Evaluation Suite</span>
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
