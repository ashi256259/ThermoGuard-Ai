import re
with open("server.ts", "r") as f:
    content = f.read()

# For reset-demo
old1 = """app.post("/api/scenarios/reset-demo", async (req, res) => {
    hotspots = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));
    await runMLClassification(hotspots);"""
new1 = """app.post("/api/scenarios/reset-demo", async (req, res) => {
    hotspots = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));"""
content = content.replace(old1, new1)

# For load-scenario
old2 = """app.post("/api/scenarios/:id/load", async (req, res) => {
    const scenarioId = req.params.id;
    const demoEvents = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));
    await runMLClassification(demoEvents);"""
new2 = """app.post("/api/scenarios/:id/load", async (req, res) => {
    const scenarioId = req.params.id;
    const demoEvents = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));"""
content = content.replace(old2, new2)

# For initial DB load
old3 = """console.log("ThermoGuard: No DB records found or DB offline. Seeding from RAW_HOTSPOTS.");
    hotspots = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));
    await runMLClassification(hotspots);"""
new3 = """console.log("ThermoGuard: No DB records found or DB offline. Seeding from RAW_HOTSPOTS.");
    hotspots = RAW_HOTSPOTS.map((h) => processThermalEvent(h, true));"""
content = content.replace(old3, new3)

with open("server.ts", "w") as f:
    f.write(content)
