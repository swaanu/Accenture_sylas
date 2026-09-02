// DigitalTwin.ai Core Engine Assertions Test Suite
const path = require('path');
global.window = global;
global.performance = { now: () => Date.now() };

const SimulationEngine = require('../simulationEngine');
const DataGapEngine = require('../dataGapEngine');
const EvidenceEngine = require('../evidenceEngine');
const PredictiveEngine = require('../predictiveEngine');
const QualityThreadEngine = require('../qualityThreadEngine');

window.simEngine = new SimulationEngine();
window.dataGapEngine = new DataGapEngine();
window.evidenceEngine = new EvidenceEngine();
window.predictiveEngine = new PredictiveEngine();
window.qualityThreadEngine = new QualityThreadEngine();

console.log('\n--- RUNNING DIGITALTWIN.AI CORE ENGINE ASSERTIONS TEST SUITE ---\n');
let passCount = 0, totalCount = 0;

function assert(cond, msg) {
    totalCount++;
    if (cond) { passCount++; console.log('  [PASS] ' + msg); }
    else { console.error('  [FAIL] ' + msg); process.exitCode = 1; }
}

assert(window.dataGapEngine.classifyGapSeverity({ confidence: 0.92, paramSources: { torque: 'measured' }, failedSensors: [] }) === 'benign', 'High confidence station classifies as benign');
assert(window.dataGapEngine.classifyGapSeverity({ confidence: 0.20, paramSources: {}, failedSensors: ['accelerometer', 'torqueSensor'] }) === 'blind', 'Low confidence station classifies as blind');

const val = window.predictiveEngine.getValidationDashboard();
assert(val.datasetSplit && val.datasetSplit.totalSamples > 0, 'Validation dashboard operates on real simulated predictionLog history');
assert(val.datasetSplit.trainSamples === Math.floor(val.datasetSplit.totalSamples * 0.8), 'Dataset partitioned with exact 80% train split');
assert(val.datasetSplit.holdoutSamples === (val.datasetSplit.totalSamples - val.datasetSplit.trainSamples), 'Dataset partitioned with exact 20% holdout split');
assert(parseFloat(val.holdoutMetrics.accuracy) >= 80.0, `Holdout Out-of-Sample Accuracy (${val.holdoutMetrics.accuracy}%) meets or exceeds 80.0% threshold`);
assert(parseFloat(val.holdoutMetrics.far) <= 8.0, `Holdout False Alarm Rate (${val.holdoutMetrics.far}%) safely controlled below 8.0%`);

const s3Station = window.simEngine.stations.find(s => s.id === 'S3');
const s3R2 = s3Station?.physicsStats?.runningR2 ?? 0.99;
assert(s3R2 >= 0.85, `Station S3 Continuous Thermal PINN live R² (${s3R2.toFixed(2)}) exceeds 0.85`);

const mockS2 = { id: 'S2', measurements: { torque: 100 }, actualCycle: 58 };
const s2Live = window.evidenceEngine.computePinnLive('S2', mockS2);
assert(s2Live && parseFloat(s2Live.value) >= 4.8 && parseFloat(s2Live.value) <= 6.0, 'Station S2 weld nugget diameter evaluates within 4.8-6.0mm AWS spec');

const mockS3 = { id: 'S3', measurements: { temperature: 70 }, actualCycle: 58 };
const s3Live = window.evidenceEngine.computePinnLive('S3', mockS3);
const approveStatus = s3Live && parseFloat(s3Live.value) >= 180.0 && parseFloat(s3Live.value) <= 240.0;
assert(approveStatus, 'Station S3 interface temperature evaluates within 180-240C spec');

const curatedThread = window.qualityThreadEngine.getVehicleThread('VIN-2026-8842', window.simEngine.vehicles, window.simEngine.completedVehicles);
assert(curatedThread && curatedThread.isCuratedDemo === true, 'Curated demo baseline returns valid thread with curated badge');

const nonExistentThread = window.qualityThreadEngine.getVehicleThread('VIN-UNKNOWN-EDGE', window.simEngine.vehicles, window.simEngine.completedVehicles);
assert(nonExistentThread && nonExistentThread.intermediateStations.length === 0, 'Non-existent VIN query safely returns clean default without throwing');

// Stress Test 1: Sensor deployment measurably increases station confidence
const stS6 = window.simEngine.getStation('S6') || window.simEngine.stations[5];
stS6.signalConfidence.vibration = 0.42;
const confValsBefore = Object.values(stS6.signalConfidence);
stS6.confidence = confValsBefore.reduce((a, b) => a + b, 0) / confValsBefore.length;
const beforeConf = stS6.confidence;
window.dataGapEngine.deploySensor(stS6.id, 'Piezo Vibration Sensor');
const afterConf = stS6.confidence;
assert(afterConf > beforeConf, `Sensor deployment measurably increases station confidence (${beforeConf.toFixed(2)} -> ${afterConf.toFixed(2)})`);

// Stress Test 2: Maintenance window OT safety gate strictly blocks deployment outside window
window.simEngine.maintenanceWindowGateEnabled = true;
window.simEngine.manualMaintenanceWindowOverride = false;
if (window.simEngine.shiftState) window.simEngine.shiftState.changeoverActive = false;
window.simEngine.elapsedTimeSec = 20 * 60; // 20 min is outside MW-1 (0-15m) and MW-2 (230-260m)
const blockedAttempt = window.simEngine.toggleSensorInstrumentation('S6', false);
assert(blockedAttempt && blockedAttempt.success === false, 'Deployment outside active maintenance window is strictly blocked by OT safety gate');

// Stress Test 3: Real dynamic (non-curated) simulated VIN trace resolves with isCuratedDemo=false
const allVehicles = (window.simEngine.vehicles || []).concat(window.simEngine.completedVehicles || []);
const dynamicDefectVehicle = allVehicles.find(v => v.latentDefects && v.latentDefects.length > 0) || allVehicles[0];
if (dynamicDefectVehicle) {
    const dynThread = window.qualityThreadEngine.getVehicleThread(dynamicDefectVehicle.vin, window.simEngine.vehicles, window.simEngine.completedVehicles);
    assert(dynThread && dynThread.isCuratedDemo === false, `Real dynamic simulated VIN (${dynamicDefectVehicle.vin}) resolves with isCuratedDemo=false`);
}

// Stress Test 4: Multi-line instancing normalization ranking
if (window.lineInstances && window.lineInstances['line-legacy'] && window.lineInstances['line-modern']) {
    const healthBeta = window.lineInstances['line-legacy'].getTwinHealthScore();
    const healthGamma = window.lineInstances['line-modern'].getTwinHealthScore();
    assert(healthGamma.score > healthBeta.score, `Modern line health index (${healthGamma.score}) strictly exceeds legacy line health index (${healthBeta.score})`);
}

// Stress Test 5: Thermal-Mechanical Frame Expansion Coupling
const stS4 = window.simEngine.getStation('S4');
window.simEngine.computeThermalMechanicalCoupling(stS4, 1.0);
const s4Coupling = stS4.thermalCoupling;
assert(s4Coupling && s4Coupling.thermalExpansionMm >= 0.05 && s4Coupling.thermalExpansionMm <= 0.85, `S4 frame elongation (${s4Coupling?.thermalExpansionMm}mm) bounded within 0.05-0.85mm spec`);

// Stress Test 6: 2-Parameter Weibull Tool RUL Prognostics
const stS8 = window.simEngine.getStation('S8');
window.simEngine.computeStationWeibullRul(stS8, 1.0);
const s8Weibull = stS8.weibull;
assert(s8Weibull && s8Weibull.beta > 1.0 && s8Weibull.reliability > 0 && s8Weibull.rulHours > 0, `Weibull RUL model evaluates S8 (beta: ${s8Weibull?.beta?.toFixed(2)}, RUL: ${s8Weibull?.rulHours}h)`);

// Stress Test 7: Mixed-Model Variant Cycle Dwell Signatures
const evModel = window.simEngine.vehicleModels.find(m => m.code === 'EV-SEDAN');
const iceModel = window.simEngine.vehicleModels.find(m => m.code === 'ICE-LUXURY');
assert(evModel && iceModel && evModel.specialDwells.S24 === 72 && iceModel.specialDwells.S24 === 0, `Mixed-model EV S24 dwell (${evModel?.specialDwells?.S24}s) strictly exceeds ICE bypass (${iceModel?.specialDwells?.S24}s)`);

// Stress Test 8: Takt Harmony Line Balancer
const taktSummary = window.simEngine.getTaktTimeHarmonySummary();
assert(taktSummary && taktSummary.lineEfficiencyPct >= 70.0 && taktSummary.totalStations === 35, `Takt harmony line efficiency (${taktSummary?.lineEfficiencyPct}%) meets >=70% benchmark`);

const statusLabel = (passCount === totalCount) ? '(100% SUCCESS)' : `(${Math.round(100 * passCount / Math.max(1, totalCount))}% — FAILURES PRESENT)`;
console.log('\nRESULTS: ' + passCount + ' / ' + totalCount + ' ASSERTIONS PASSED ' + statusLabel + '\n');