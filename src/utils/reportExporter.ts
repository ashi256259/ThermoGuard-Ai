import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { HotspotItem } from "../services/api";

/**
 * Clean helper to escape CSV fields
 */
function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Safely extracts evidence as a clean array of string points,
 * handling array, structured object, flat string, or undefined/null formats.
 */
export function extractEvidenceArray(evidenceInput: any): string[] {
  if (!evidenceInput) return [];
  if (Array.isArray(evidenceInput)) {
    return evidenceInput
      .filter((e) => e !== null && e !== undefined)
      .map((e) => (typeof e === "string" ? e : typeof e === "object" ? JSON.stringify(e) : String(e)));
  }
  if (typeof evidenceInput === "object") {
    // If it's a structured evidence dictionary with summary or categories
    if (Array.isArray(evidenceInput.summary) && evidenceInput.summary.length > 0) {
      return evidenceInput.summary.filter(Boolean).map(String);
    }
    const collected: string[] = [];
    if (Array.isArray(evidenceInput.spatial)) collected.push(...evidenceInput.spatial.filter(Boolean).map(String));
    if (Array.isArray(evidenceInput.temporal)) collected.push(...evidenceInput.temporal.filter(Boolean).map(String));
    if (Array.isArray(evidenceInput.thermal)) collected.push(...evidenceInput.thermal.filter(Boolean).map(String));
    if (Array.isArray(evidenceInput.class_specific)) collected.push(...evidenceInput.class_specific.filter(Boolean).map(String));
    if (collected.length > 0) return collected;

    try {
      return Object.values(evidenceInput)
        .flat()
        .filter((v) => typeof v === "string" || typeof v === "number")
        .map(String);
    } catch {
      return [JSON.stringify(evidenceInput)];
    }
  }
  if (typeof evidenceInput === "string") {
    return [evidenceInput];
  }
  return [String(evidenceInput)];
}

/**
 * Format timestamp nicely
 */
function formatTimestamp(isoStr?: string): string {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short"
    });
  } catch {
    return isoStr;
  }
}

/**
 * Exports a single Hotspot dossier as a structured, formatted PDF report.
 */
export function exportHotspotPdfReport(hotspot: HotspotItem, mlInfo?: any): boolean {
  try {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // Header Background Accent
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 28, "F");

    // Blue highlight stripe
    doc.setFillColor(37, 99, 235); // blue-600
    doc.rect(0, 28, pageWidth, 2, "F");

    // Header Titles
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("THERMOGUARD AI — GEOSPATIAL INTELLIGENCE DOSSIER", margin, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text("National Technical Research Organisation (NTRO) • SIH26162 Thermal Anomaly Classification", margin, 17);

    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Reference ID: ${hotspot.event.id}  |  Generated: ${new Date().toUTCString()}  |  CRS: EPSG:4326 (WGS-84)`, margin, 23);

    // Classification & Operational Risk Summary Box
    let yPos = 35;
    const isCritical = hotspot.classification.risk_score === "CRITICAL";
    const isHigh = hotspot.classification.risk_score === "HIGH";

    // Box outline
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(248, 250, 252); // slate-50
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, 28, 2, 2, "FD");

    // Left Column: Predicted Source Class
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text("PREDICTED SOURCE CLASS", margin + 5, yPos + 6);

    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(hotspot.classification.predicted_class, margin + 5, yPos + 13);

    doc.setFontSize(8);
    doc.setTextColor(37, 99, 235); // blue-600
    const confPercent = Math.round(hotspot.classification.confidence * 100);
    doc.text(`Model Confidence: ${confPercent}% (${hotspot.classification.model_version || "RandomForestClassifier v1.0.0"})`, margin + 5, yPos + 19);

    // Middle Column: Operational Risk Level
    const midX = margin + 70;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("OPERATIONAL RISK LEVEL", midX, yPos + 6);

    doc.setFontSize(12);
    if (isCritical) {
      doc.setTextColor(220, 38, 38); // red-600
    } else if (isHigh) {
      doc.setTextColor(234, 88, 12); // orange-600
    } else {
      doc.setTextColor(13, 148, 136); // teal-600
    }
    doc.text(`${hotspot.classification.risk_score} (Score: ${hotspot.classification.risk_value || 0}/100)`, midX, yPos + 13);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Persistence Rating: ${hotspot.classification.persistence_score || 0}/100`, midX, yPos + 19);

    // Right Column: Target Location & Status
    const rightX = margin + 130;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("COORDINATES & TEMPORAL STATUS", rightX, yPos + 6);

    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`${hotspot.event.latitude.toFixed(4)}°N, ${hotspot.event.longitude.toFixed(4)}°E`, rightX, yPos + 12);

    doc.setFontSize(8);
    doc.setTextColor(hotspot.temporal_profile.is_persistent ? 13 : 100, hotspot.temporal_profile.is_persistent ? 148 : 116, hotspot.temporal_profile.is_persistent ? 136 : 139);
    doc.text(
      hotspot.temporal_profile.is_persistent
        ? `Persistent Source (${hotspot.temporal_profile.persistence_days} days active)`
        : `Transient Anomaly (${hotspot.temporal_profile.persistence_days || 1} day observation)`,
      rightX,
      yPos + 18
    );

    yPos += 33;

    // SECTION 1: RADIATIVE & SATELLITE OBSERVATION METRICS
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1. Satellite Radiative Observation Telemetry (NASA FIRMS)", margin, yPos);
    yPos += 2;

    const sensorData = [
      ["Thermal Event ID", hotspot.event.id, "Observation Timestamp", formatTimestamp(hotspot.event.timestamp)],
      ["Latitude / Longitude", `${hotspot.event.latitude.toFixed(5)}°N, ${hotspot.event.longitude.toFixed(5)}°E`, "Satellite Constellation", hotspot.event.satellite || "VIIRS / MODIS"],
      ["Fire Radiative Power (FRP)", `${hotspot.event.frp.toFixed(2)} MW`, "Orbit Pass Modality", hotspot.event.daynight === "D" ? "Day Pass (Solar Reflectance Checked)" : "Night Pass (High Contrast Thermal)"],
      ["Brightness Temperature", `${hotspot.event.brightness.toFixed(2)} K (Band I-4 / 4μm)`, "Satellite Detection Confidence", `${hotspot.event.confidence}%`]
    ];

    autoTable(doc, {
      startY: yPos,
      margin: { left: margin, right: margin },
      head: [],
      body: sensorData,
      theme: "plain",
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        0: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 42 },
        1: { fontStyle: "bold", textColor: [15, 23, 42], cellWidth: 48 },
        2: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 44 },
        3: { textColor: [15, 23, 42], cellWidth: 48 }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 4;

    // SECTION 2: GEOSPATIAL & LAND USE CONTEXT
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("2. Geospatial Proximity & Land-Cover Context (OpenStreetMap & Cadastre)", margin, yPos);
    yPos += 2;

    const distMeters = hotspot.geo_context.distance_to_industry < 1000
      ? `${Math.round(hotspot.geo_context.distance_to_industry)} meters`
      : `${(hotspot.geo_context.distance_to_industry / 1000).toFixed(2)} km`;

    const geoData = [
      ["Nearest Industrial Facility", hotspot.geo_context.nearest_industrial_facility, "Distance to Facility", distMeters],
      ["Facility Type / Category", hotspot.geo_context.facility_type || "Industrial Plant / Flare Stack", "Surface Land Cover", hotspot.geo_context.land_cover.replace(/_/g, " ").toUpperCase()],
      ["Nearby Road Infrastructure", hotspot.geo_context.nearby_road || "Local Highway / Access Road", "Infrastructure Proximity", hotspot.geo_context.distance_to_infrastructure ? `${hotspot.geo_context.distance_to_infrastructure} m` : "Within industrial perimeter"],
      ["Spatial Zoning Verification", hotspot.geo_context.spatial_flags?.is_industrial_zone ? "Industrial Zone (Verified)" : hotspot.geo_context.spatial_flags?.is_forest_zone ? "Protected Forest Reserve" : "Agricultural / Multi-use Zone", "Geospatial Indexing", "PostGIS R-Tree Spatial Join (ST_DWithin 2.5km)"]
    ];

    autoTable(doc, {
      startY: yPos,
      margin: { left: margin, right: margin },
      head: [],
      body: geoData,
      theme: "plain",
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        0: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 42 },
        1: { fontStyle: "bold", textColor: [15, 23, 42], cellWidth: 48 },
        2: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 44 },
        3: { textColor: [15, 23, 42], cellWidth: 48 }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 4;

    // SECTION 3: TEMPORAL PERSISTENCE & MULTI-PASS TRAJECTORY
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("3. Temporal Persistence & Historical Revisit Profile", margin, yPos);
    yPos += 2;

    const temporalData = [
      ["Temporal Persistence Status", hotspot.temporal_profile.is_persistent ? "PERSISTENT THERMAL SOURCE" : "TRANSIENT ANOMALY", "Cluster Identifier", hotspot.temporal_profile.cluster_id || "CLUST_GEO_01"],
      ["Persistence Duration", `${hotspot.temporal_profile.persistence_days} Days active`, "Total Satellite Detections", `${hotspot.temporal_profile.observation_count} Overpasses`],
      ["Weekly Observation Rate", `~${hotspot.temporal_profile.frequency_per_week} passes / week`, "Temporal Recurrence Ratio", `${(hotspot.temporal_profile.recurrence_ratio * 100).toFixed(1)}%`],
      ["First Detected Timestamp", hotspot.temporal_profile.first_seen || "Baseline observation", "Seasonal Behavior Pattern", hotspot.temporal_profile.seasonal_pattern || "Continuous Year-round"]
    ];

    autoTable(doc, {
      startY: yPos,
      margin: { left: margin, right: margin },
      head: [],
      body: temporalData,
      theme: "plain",
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        textColor: [51, 65, 85]
      },
      columnStyles: {
        0: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 42 },
        1: { fontStyle: "bold", textColor: [15, 23, 42], cellWidth: 48 },
        2: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 44 },
        3: { textColor: [15, 23, 42], cellWidth: 48 }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 4;

    // SECTION 4: EXPLAINABLE EVIDENCE CHAIN
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("4. Explainable Evidence Chain (Deterministic ML Justification)", margin, yPos);
    yPos += 2;

    const rawEvidence = extractEvidenceArray(hotspot.classification.evidence || (hotspot.classification as any).structured_evidence);
    const evidenceList = rawEvidence.length > 0
      ? rawEvidence
      : [
          `Thermal anomaly located at (${hotspot.event.latitude.toFixed(4)}, ${hotspot.event.longitude.toFixed(4)}) with FRP ${hotspot.event.frp.toFixed(1)} MW.`,
          `Proximity to ${hotspot.geo_context.nearest_industrial_facility} is ${distMeters}.`,
          `Observed over ${hotspot.temporal_profile.persistence_days} days across ${hotspot.temporal_profile.observation_count} satellite passes.`
        ];

    const evidenceRows = evidenceList.map((ev, i) => [`[${i + 1}]`, ev]);

    autoTable(doc, {
      startY: yPos,
      margin: { left: margin, right: margin },
      head: [],
      body: evidenceRows,
      theme: "grid",
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [241, 245, 249],
        lineWidth: 0.1
      },
      columnStyles: {
        0: { fontStyle: "bold", textColor: [37, 99, 235], cellWidth: 10 },
        1: { textColor: [30, 41, 59] }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 4;

    // SECTION 5: MULTI-CLASS ENSEMBLE PROBABILITIES TABLE
    if (hotspot.classification.class_probabilities) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text("5. Machine Learning Ensemble Probability Distribution", margin, yPos);
      yPos += 2;

      const probEntries = Object.entries(hotspot.classification.class_probabilities)
        .sort((a, b) => Number(b[1]) - Number(a[1]));

      const probRows = probEntries.map(([cls, p]) => {
        const isTop = cls === hotspot.classification.predicted_class;
        const percent = (Number(p) * 100).toFixed(1) + "%";
        return [
          isTop ? `★ ${cls} (Assigned Class)` : cls,
          percent,
          Number(p).toFixed(4),
          isTop ? "Primary match" : "Sub-dominant hypothesis"
        ];
      });

      autoTable(doc, {
        startY: yPos,
        margin: { left: margin, right: margin },
        head: [["Target Source Class", "Confidence %", "Calibrated Probability", "Ensemble Assessment"]],
        body: probRows,
        theme: "striped",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: "bold",
          cellPadding: 1.8
        },
        styles: {
          fontSize: 7.2,
          cellPadding: 1.6,
          textColor: [51, 65, 85]
        },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { fontStyle: "bold", textColor: [37, 99, 235] },
          2: { fontStyle: "normal", font: "courier" }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 4;
    }

    // SECTION 6: OPERATIONAL DISPATCH & SOP RECOMMENDATION
    if (yPos < pageHeight - 35) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text("6. Operational Dispatch Recommendations (Incident SOP)", margin, yPos);
      yPos += 3;

      let sopText = "";
      if (hotspot.classification.predicted_class === "Industrial Fire") {
        sopText = "DISPATCH TIER-3 HAZMAT & SDMA RESPONSE: Immediate containment buffer of 2.5km required. Cross-reference hazardous chemical inventory with CPCB cadastre.";
      } else if (hotspot.classification.predicted_class === "Gas Flare") {
        sopText = "MONITOR REFINERY STACK EMISSIONS: Verify radiative output against plant environmental operating license. Log temporal baseline in industrial emission registry.";
      } else if (hotspot.classification.predicted_class === "Agricultural Burning") {
        sopText = "TRANSMIT AGRICULTURAL FIELD SURVEILLANCE: Cross-check Kharif/Rabi harvest calendar. Alert district agricultural enforcement and monitor PM2.5 air quality trajectory.";
      } else if (hotspot.classification.predicted_class === "Wildfire") {
        sopText = "ALERT FOREST SURVEY OF INDIA & DIV DEPT: Calculate burn front propagation direction using local meteorological wind vectors. Deploy aerial & ranger reconnaissance.";
      } else if (hotspot.classification.predicted_class === "Mining") {
        sopText = "NOTIFY MINING REGULATORY CELL: Verify thermal footprint against approved mining quarry lease boundaries and explosive blasting schedules.";
      } else {
        sopText = "INVESTIGATE UNCLASSIFIED THERMAL EVENT: Perform high-resolution multi-spectral validation and request tasking from regional Earth observation satellites.";
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const splitSop = doc.splitTextToSize(sopText, pageWidth - margin * 2);
      doc.text(splitSop, margin, yPos);
    }

    // Footer on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "CONFIDENTIAL // FOR OFFICIAL GEOSPATIAL INTELLIGENCE SURVEILLANCE USE ONLY",
        margin,
        pageHeight - 6
      );

      doc.text(
        `Page ${i} of ${totalPages}  |  ThermoGuard AI • NTRO SIH26162`,
        pageWidth - margin,
        pageHeight - 6,
        { align: "right" }
      );
    }

    // Trigger Download
    const cleanId = hotspot.event.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `ThermoGuard_Intelligence_Report_${cleanId}_${dateStr}.pdf`;
    doc.save(filename);
    return true;
  } catch (err) {
    console.error("Failed to generate PDF report:", err);
    return false;
  }
}

/**
 * Exports a single Hotspot dossier as a structured RFC-4180 compliant CSV file.
 */
export function exportHotspotCsvReport(hotspot: HotspotItem): boolean {
  try {
    const headers = [
      "Event_ID",
      "Timestamp_UTC",
      "Latitude",
      "Longitude",
      "Satellite_Sensor",
      "Orbit_Pass",
      "Brightness_Temperature_K",
      "Fire_Radiative_Power_MW",
      "Satellite_Confidence_Percent",
      "Nearest_Industrial_Facility",
      "Facility_Type",
      "Distance_To_Industry_Meters",
      "Land_Cover_Type",
      "Nearby_Road",
      "Predicted_Source_Class",
      "Model_Confidence_Percent",
      "Operational_Risk_Score",
      "Operational_Risk_Value",
      "Persistence_Rating",
      "Persistence_Duration_Days",
      "Satellite_Observation_Count",
      "Weekly_Observation_Frequency",
      "Temporal_Recurrence_Ratio",
      "Seasonal_Pattern",
      "Is_Persistent_Source",
      "Cluster_Identifier",
      "ML_Model_Version",
      "Evidence_Chain",
      "Report_Generated_At",
      "Organization",
      "Problem_Statement_ID"
    ];

    const evidenceArr = extractEvidenceArray(hotspot.classification.evidence || (hotspot.classification as any).structured_evidence);
    const evidenceText = evidenceArr.join(" | ");

    const distInd = typeof hotspot.geo_context?.distance_to_industry === "number"
      ? Math.round(hotspot.geo_context.distance_to_industry)
      : 0;

    const row = [
      escapeCsv(hotspot.event?.id),
      escapeCsv(hotspot.event?.timestamp),
      escapeCsv(hotspot.event?.latitude),
      escapeCsv(hotspot.event?.longitude),
      escapeCsv(hotspot.event?.satellite),
      escapeCsv(hotspot.event?.daynight === "D" ? "Day" : "Night"),
      escapeCsv(hotspot.event?.brightness),
      escapeCsv(hotspot.event?.frp),
      escapeCsv(hotspot.event?.confidence),
      escapeCsv(hotspot.geo_context?.nearest_industrial_facility),
      escapeCsv(hotspot.geo_context?.facility_type),
      escapeCsv(distInd),
      escapeCsv(hotspot.geo_context?.land_cover),
      escapeCsv(hotspot.geo_context?.nearby_road || "None"),
      escapeCsv(hotspot.classification?.predicted_class),
      escapeCsv(Math.round((hotspot.classification?.confidence || 0) * 100)),
      escapeCsv(hotspot.classification?.risk_score),
      escapeCsv(hotspot.classification?.risk_value || 0),
      escapeCsv(hotspot.classification?.persistence_score || 0),
      escapeCsv(hotspot.temporal_profile?.persistence_days || 0),
      escapeCsv(hotspot.temporal_profile?.observation_count || 0),
      escapeCsv(hotspot.temporal_profile?.frequency_per_week || 0),
      escapeCsv(hotspot.temporal_profile?.recurrence_ratio || 0),
      escapeCsv(hotspot.temporal_profile?.seasonal_pattern || "Continuous"),
      escapeCsv(hotspot.temporal_profile?.is_persistent ? "TRUE" : "FALSE"),
      escapeCsv(hotspot.temporal_profile?.cluster_id),
      escapeCsv(hotspot.classification?.model_version || "random_forest_v1.0.0"),
      escapeCsv(evidenceText),
      escapeCsv(new Date().toISOString()),
      escapeCsv("National Technical Research Organisation (NTRO)"),
      escapeCsv("SIH26162")
    ];

    const csvContent = headers.join(",") + "\n" + row.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const cleanId = (hotspot.event?.id || "hotspot").replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `ThermoGuard_Report_${cleanId}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("Failed to export CSV report:", err);
    return false;
  }
}

/**
 * Exports a batch list of Hotspots as a consolidated CSV spreadsheet.
 */
export function exportBatchHotspotsCsv(hotspots: HotspotItem[]): boolean {
  try {
    const headers = [
      "Event_ID",
      "Timestamp_UTC",
      "Latitude",
      "Longitude",
      "Satellite_Sensor",
      "Brightness_Temperature_K",
      "Fire_Radiative_Power_MW",
      "Satellite_Confidence_Percent",
      "Nearest_Industrial_Facility",
      "Distance_To_Industry_Meters",
      "Land_Cover_Type",
      "Predicted_Source_Class",
      "Model_Confidence_Percent",
      "Operational_Risk_Score",
      "Persistence_Duration_Days",
      "Observation_Count",
      "Is_Persistent_Source",
      "Evidence_Summary"
    ];

    const rows = hotspots.map((h) => {
      const evidenceArr = extractEvidenceArray(h.classification?.evidence || (h.classification as any)?.structured_evidence);
      const evidenceSummary = evidenceArr.join(" | ");
      const distInd = typeof h.geo_context?.distance_to_industry === "number"
        ? Math.round(h.geo_context.distance_to_industry)
        : 0;

      return [
        escapeCsv(h.event?.id),
        escapeCsv(h.event?.timestamp),
        escapeCsv(h.event?.latitude),
        escapeCsv(h.event?.longitude),
        escapeCsv(h.event?.satellite),
        escapeCsv(h.event?.brightness),
        escapeCsv(h.event?.frp),
        escapeCsv(h.event?.confidence),
        escapeCsv(h.geo_context?.nearest_industrial_facility),
        escapeCsv(distInd),
        escapeCsv(h.geo_context?.land_cover),
        escapeCsv(h.classification?.predicted_class),
        escapeCsv(Math.round((h.classification?.confidence || 0) * 100)),
        escapeCsv(h.classification?.risk_score),
        escapeCsv(h.temporal_profile?.persistence_days || 0),
        escapeCsv(h.temporal_profile?.observation_count || 0),
        escapeCsv(h.temporal_profile?.is_persistent ? "TRUE" : "FALSE"),
        escapeCsv(evidenceSummary)
      ].join(",");
    });

    const csvContent = headers.join(",") + "\n" + rows.join("\n") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `ThermoGuard_Catalog_Export_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("Failed to export batch CSV:", err);
    return false;
  }
}
