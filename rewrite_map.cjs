const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

const regex = /\{sortedAlerts\.map\(\(alert, index\) => \{([\s\S]*?)\}\)\}/;

const newCode = `{sortedAlerts.map((alert, index) => {
            const isCrit = alert.severity === "CRITICAL";
            const isHigh = alert.severity === "HIGH";
            const severityStyle = isCrit
              ? "bg-red-50/50 border-red-200"
              : isHigh
              ? "bg-orange-50/50 border-orange-200"
              : "bg-white border-slate-200/80";
            
            const isAck = alert.status === "ACKNOWLEDGED";
            const isResolved = alert.status === "RESOLVED";

            const h = hotspots?.find(hs => hs.event.id === alert.event_id);
            
            return (
              <div
                key={alert.id ? \`\${alert.id}-\${index}\` : \`alert-\${index}\`}
                className={\`p-4 sm:p-5 rounded-2xl border transition-all shadow-xs \${severityStyle} flex flex-col gap-4\`}
              >
                {/* 1. Header: Incident ID, Time, Priority */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-200/60">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ShieldAlert className={\`w-4 h-4 flex-shrink-0 \${isCrit ? "text-red-600" : isHigh ? "text-orange-600" : "text-amber-600"}\`} />
                      <span className="font-bold text-slate-900 text-[15px] tracking-tight">INCIDENT: {alert.event_id}</span>
                      <span
                        className={\`text-[10px] px-2.5 py-0.5 rounded font-bold border uppercase \${
                          isCrit
                            ? "bg-red-50 text-red-700 border-red-200"
                            : isHigh
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }\`}
                      >
                        {alert.severity} PRIORITY
                      </span>
                      <span
                        className={\`text-[10px] px-2.5 py-0.5 rounded font-bold border uppercase \${
                          isResolved
                            ? "bg-teal-50 text-teal-700 border-teal-200"
                            : isAck
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }\`}
                      >
                        Status: {alert.status}
                      </span>
                    </div>
                    {h && (
                      <div className="flex items-center gap-3 text-xs text-slate-500 font-mono flex-wrap mt-1">
                        <div className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {h.event.latitude.toFixed(4)}, {h.event.longitude.toFixed(4)}</div>
                        <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(h.event.timestamp).toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                  {/* Recommended Attention Badge */}
                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recommended Attention</span>
                    <span className={\`text-xs font-bold px-3 py-1 rounded-lg border \${isCrit ? "bg-red-100 text-red-800 border-red-200" : isHigh ? "bg-orange-100 text-orange-800 border-orange-200" : "bg-blue-50 text-blue-800 border-blue-200"}\`}>
                      {alert.action_recommended || (isCrit ? "Immediate Investigation" : isHigh ? "Field Verification" : "Monitor")}
                    </span>
                  </div>
                </div>

                {/* Grid for Incident Details */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column: Classification & Attributes */}
                  <div className="flex flex-col gap-3">
                    <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Classification & Context</h4>
                      {h ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Source:</span>
                            <span className="text-xs font-bold text-slate-900">{h.classification.predicted_class}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">AI Confidence:</span>
                            <span className="text-xs font-bold text-emerald-600">{(h.classification.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Risk Score:</span>
                            <span className="text-xs font-bold text-red-600">{h.classification.risk_value} / 100</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Persistence:</span>
                            <span className={\`text-[10px] px-2 py-0.5 rounded font-bold uppercase \${h.temporal_profile.is_persistent ? "bg-indigo-50 text-indigo-700 border-indigo-200 border" : "bg-slate-100 text-slate-600 border border-slate-200"}\`}>
                              {h.temporal_profile.is_persistent ? "PERSISTENT" : "TRANSIENT"}
                            </span>
                          </div>
                          {h.geo_context.nearest_industrial_facility !== "Unknown" && (
                            <div className="flex items-start justify-between gap-2 border-t border-slate-100 pt-2 mt-2">
                              <span className="text-xs text-slate-500 whitespace-nowrap">Near:</span>
                              <span className="text-xs font-semibold text-slate-800 text-right">{h.geo_context.nearest_industrial_facility}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">No detailed telemetry available.</div>
                      )}
                    </div>
                  </div>

                  {/* Middle Column: Evidence */}
                  <div className="lg:col-span-2 flex flex-col gap-2">
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5 text-blue-600" /> Evidence for Alert</h4>
                    <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100">
                      {h && h.classification.evidence && h.classification.evidence.length > 0 ? (
                        <ul className="space-y-1.5">
                          {h.classification.evidence.map((ev, i) => (
                            <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5 leading-relaxed">
                              <span className="text-blue-500 font-bold mt-0.5">•</span>
                              <span>{ev}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-xs text-slate-700 leading-relaxed font-medium">{alert.description}</div>
                      )}
                    </div>
                    {/* Priority Reason */}
                    <div className="mt-1 flex items-start gap-2 text-[11px] text-slate-600 bg-slate-100/80 rounded-lg p-2.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <p>
                        <span className="font-bold text-slate-700 mr-1">Priority Assignment:</span>
                        {h ? \`Escalated to \${alert.severity} due to Risk Score of \${h.classification.risk_value} and \${h.temporal_profile.is_persistent ? "persistent" : "acute"} characteristics.\` : "Assigned based on hazard proximity and intensity."}
                      </p>
                    </div>
                  </div>
                </div>

                <IncidentStatusTracker status={alert.incident_status || alert.status} />

                {/* Assign and Update Status block */}
                {canResolveAlerts && (isCrit || isHigh) && alert.status !== "RESOLVED" && (
                  <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row gap-3">
                    <select
                      onChange={(e) => handleAssignTeam(alert.id, e.target.value)}
                      value={alert.assigned_team || ""}
                      className="flex-1 px-3 py-1.5 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-xs cursor-pointer outline-none"
                    >
                      <option value="" disabled>Assign Response Team...</option>
                      <option value="Industrial Emergency Response">Industrial Emergency Response</option>
                      <option value="Forest Fire Response">Forest Fire Response</option>
                      <option value="Field Inspection">Field Inspection</option>
                      <option value="GIS Verification">GIS Verification</option>
                    </select>
                    <select
                      onChange={(e) => handleIncidentAction(alert.id, e.target.value, e.target.value === "INVESTIGATE" ? "INVESTIGATING" : e.target.value)}
                      value=""
                      className="px-3 py-1.5 bg-white text-blue-700 text-xs font-bold rounded-lg border border-blue-300 shadow-xs cursor-pointer outline-none"
                    >
                      <option value="" disabled>Update Status...</option>
                      <option value="ACKNOWLEDGE">Acknowledge</option>
                      <option value="INVESTIGATE">Investigating</option>
                      <option value="RESOLVE">Mark Resolved</option>
                      <option value="ESCALATE">Escalate to Critical</option>
                    </select>
                  </div>
                )}

                {/* Interactive Action Bar */}
                <div className="mt-2 pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {canResolveAlerts ? (
                      <>
                        {alert.status !== "ACKNOWLEDGED" && alert.status !== "RESOLVED" && (
                          <button
                            onClick={() => handleUpdateStatus(alert.id, "ACKNOWLEDGED")}
                            disabled={actionLoadingId === alert.id}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Acknowledge</span>
                          </button>
                        )}
                        {alert.status !== "RESOLVED" && (
                          <button
                            onClick={() => handleUpdateStatus(alert.id, "RESOLVED")}
                            disabled={actionLoadingId === alert.id}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Mark Resolved</span>
                          </button>
                        )}
                        {alert.status === "RESOLVED" && (
                          <button
                            onClick={() => handleUpdateStatus(alert.id, "ACTIVE")}
                            disabled={actionLoadingId === alert.id}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                          >
                            <span>Reopen Incident</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-500">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>Analyst Clearance (Inspect & Dossier Only)</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {alert.event_id && onSelectHotspot && (
                      <button
                        onClick={() => handleInspect(alert.event_id)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-blue-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <span>View Evidence</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                      </button>
                    )}
                    {alert.event_id && onViewOnMap && (
                      <button
                        onClick={() => handleShowOnMap(alert.event_id)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-emerald-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Map</span>
                      </button>
                    )}
                    {alert.event_id && onOpenTimeline && (
                      <button
                        onClick={() => handleShowTimeline(alert.event_id)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-teal-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <History className="w-3.5 h-3.5 text-teal-600" />
                        <span>Timeline</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}`;

code = code.replace(regex, newCode);
fs.writeFileSync('src/pages/AlertsPage.tsx', code);
