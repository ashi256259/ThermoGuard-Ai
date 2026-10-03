const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

// Replace sortedAlerts definition
const oldSort = `  const sortedAlerts = React.useMemo(() => {
    let sorted = [...alerts];
    if (sortBy === "priority") {
      const score = { "CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1 };
      sorted.sort((a, b) => (score[b.severity] || 0) - (score[a.severity] || 0));
    } else if (sortBy === "newest") {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "persistent") {
      sorted.sort((a, b) => {
        const ha = hotspots?.find(h => h.event.id === a.event_id);
        const hb = hotspots?.find(h => h.event.id === b.event_id);
        const pA = ha?.temporal_profile?.is_persistent ? 1 : 0;
        const pB = hb?.temporal_profile?.is_persistent ? 1 : 0;
        if (pB !== pA) return pB - pA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return sorted;
  }, [alerts, sortBy, hotspots]);`;

const newSort = `  const sortedAlerts = React.useMemo(() => {
    let sorted = [...alerts];
    if (sortBy === "critical_first" || sortBy === "priority") {
      const score: Record<string, number> = { "CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1 };
      sorted.sort((a, b) => (score[b.severity] || 0) - (score[a.severity] || 0));
    } else if (sortBy === "high") {
      sorted.sort((a, b) => (a.severity === "HIGH" ? -1 : b.severity === "HIGH" ? 1 : 0));
    } else if (sortBy === "medium") {
      sorted.sort((a, b) => (a.severity === "MEDIUM" ? -1 : b.severity === "MEDIUM" ? 1 : 0));
    } else if (sortBy === "low") {
      sorted.sort((a, b) => (a.severity === "LOW" ? -1 : b.severity === "LOW" ? 1 : 0));
    } else if (sortBy === "newest") {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === "persistent") {
      sorted.sort((a, b) => {
        const ha = hotspots?.find(h => h.event.id === a.event_id);
        const hb = hotspots?.find(h => h.event.id === b.event_id);
        const pA = ha?.temporal_profile?.is_persistent ? 1 : 0;
        const pB = hb?.temporal_profile?.is_persistent ? 1 : 0;
        if (pB !== pA) return pB - pA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return sorted;
  }, [alerts, sortBy, hotspots]);`;

code = code.replace(oldSort, newSort);

// Now let's add the Prioritization / Sort toolbar inside the Filter Bar
const targetFilterEnd = `          <div className="flex items-center gap-2 max-w-full overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-slate-700 flex-shrink-0">Status:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {["All", "ACTIVE", "ACKNOWLEDGED", "RESOLVED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={\`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[32px] \${
                    selectedStatus === st
                      ? "bg-white text-teal-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }\`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>`;

const replacementFilterEnd = `          <div className="flex items-center gap-2 max-w-full overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-slate-700 flex-shrink-0">Status:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {["All", "ACTIVE", "ACKNOWLEDGED", "RESOLVED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStatus(st)}
                  className={\`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[32px] \${
                    selectedStatus === st
                      ? "bg-white text-teal-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }\`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden md:block" />

          {/* Prioritization / Sort Controls */}
          <div className="flex items-center gap-2 max-w-full overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-slate-700 flex-shrink-0">Prioritization:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {[
                { id: "critical_first", label: "Critical first" },
                { id: "high", label: "High" },
                { id: "medium", label: "Medium" },
                { id: "low", label: "Low" },
                { id: "newest", label: "Newest" },
                { id: "persistent", label: "Persistent" }
              ].map((sortOption) => (
                <button
                  key={sortOption.id}
                  onClick={() => setSortBy(sortOption.id)}
                  className={\`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[32px] \${
                    sortBy === sortOption.id
                      ? "bg-white text-blue-700 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }\`}
                >
                  {sortOption.label}
                </button>
              ))}
            </div>
          </div>
        </div>`;

code = code.replace(targetFilterEnd, replacementFilterEnd);
fs.writeFileSync('src/pages/AlertsPage.tsx', code);
