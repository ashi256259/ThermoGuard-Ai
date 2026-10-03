const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

const memoCode = `
  const sortedAlerts = React.useMemo(() => {
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
  }, [alerts, sortBy, hotspots]);

  const totalCount = alerts.length;
`;

code = code.replace(
  '// Aggregated alert counts\n  const totalCount = alerts.length;',
  memoCode
);

fs.writeFileSync('src/pages/AlertsPage.tsx', code);
