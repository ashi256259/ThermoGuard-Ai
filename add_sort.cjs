const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

const sortCode = `
          <div className="h-4 w-px bg-slate-200 hidden md:block" />

          <div className="flex items-center gap-2 max-w-full overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-slate-700 flex-shrink-0">Sort:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {[
                { id: "priority", label: "Priority" },
                { id: "newest", label: "Newest" },
                { id: "persistent", label: "Persistent First" }
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSortBy(s.id)}
                  className={\`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[32px] \${
                    sortBy === s.id
                      ? "bg-white text-emerald-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }\`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
`;

code = code.replace(
  '// Map over sortedAlerts instead of alerts',
  '' // clean up if I left it
);
code = code.replace(
  'alerts.map((alert, index) => {',
  'sortedAlerts.map((alert, index) => {'
);
code = code.replace(
  'alerts.length === 0',
  'sortedAlerts.length === 0'
);
code = code.replace(
  '</div>\n      </div>\n\n      {loading ? (',
  '</div>\n' + sortCode + '\n      </div>\n\n      {loading ? ('
);

fs.writeFileSync('src/pages/AlertsPage.tsx', code);
