import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface ObservationItem {
  date: string;
  timestamp?: string;
  frp: number;
  brightness: number;
  satellite: string;
}

interface TimelineChartProps {
  observations: ObservationItem[];
}

export const TimelineChart: React.FC<TimelineChartProps> = ({ observations }) => {
  if (!observations || observations.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center text-slate-400 text-xs font-medium">
        No multi-temporal observation passes available
      </div>
    );
  }

  // Ensure chronologically sorted left-to-right (earliest observation on left, latest on right)
  const data = [...observations].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : new Date(a.date).getTime();
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : new Date(b.date).getTime();
    return timeA - timeB;
  });

  return (
    <div className="w-full h-36 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
      <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1.5">
        <span>Historical Radiative Power (MW)</span>
        <span className="text-blue-700 font-semibold flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
          <span>VIIRS / MODIS Passes</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={105}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: "#64748b" }} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const p = payload[0].payload as ObservationItem;
                return (
                  <div className="bg-white border border-slate-200/80 p-3 rounded-xl shadow-lg text-xs text-slate-800">
                    <p className="font-bold text-blue-700 mb-1">{label}</p>
                    <p className="text-slate-600">FRP: <span className="text-slate-900 font-bold">{p.frp} MW</span></p>
                    <p className="text-slate-600">Brightness: <span className="text-slate-900 font-semibold">{p.brightness} K</span></p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.satellite}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="frp"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ fill: "#2563eb", r: 3 }}
            activeDot={{ r: 5, fill: "#1d4ed8" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
