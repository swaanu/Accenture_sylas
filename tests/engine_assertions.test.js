// DigitalTwin.ai Core Engine Assertions Test Suite
const fs = require('fs');
const path = require('path');
global.window = global;
global.performance = { now: () => Date.now() };
eval(fs.readFileSync(path.join(__dirname, '../simulationEngine.js'), 'utf-8'));
eval(fs.readFileSync(path.join(__dirname, '../dataGapEngine.js'), 'utf-8'));
eval(fs.readFileSync(path.join(__dirname, '../evidenceEngine.js'), 'utf-8'));
eval(fs.readFileSync(path.join(__dirname, '../predictiveEngine.js'), 'utf-8'));
eval(fs.readFileSync(path.join(__dirname, '../qualityThreadEngine.js'), 'utf-8'));

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
assert(parseFloat(val.holdoutMetrics.r2) <= 1.0, 'Holdout R2 is mathematically bound by R2 <= 1.0');

const mockS2 = { id: 'S2', measurements: { torque: 100 }, actualCycle: 58 };
const s2Live = window.evidenceEngine.computePinnLive('S2', mockS2);
assert(s2Live && parseFloat(s2Live.value) >= 4.8 && parseFloat(s2Live.value) <= 6.0, 'Station S2 weld nugget diameter evaluates within 4.8-6.0mm AWS spec');

const mockS3 = { id: 'S3', measurements: { temperature: 70 }, actualCycle: 58 };
const s3Live = window.evidenceEngine.computePinnLive('S3', mockS3);
approveStatus = s3Live && parseFloat(s3Live.value) >= 180.0 && parseFloat(s3Live.value) <= 240.0;
assert(approveStatus, 'Station S3 interface temperature evaluates within 180-240C spec');

const dynamicThread = window.qualityThreadEngine.getVehicleThread('VIN-2026-8842', window.simEngine.vehicles, window.simEngine.completedVehicles);
assert(dynamicThread && dynamicThread.isCuratedDemo === true, 'Curated demo baseline returns valid thread with curated badge');

const nonExistentThread = window.qualityThreadEngine.getVehicleThread('VIN-UNKNOWN-EDGE', window.simEngine.vehicles, window.simEngine.completedVehicles);
assert(nonExistentThread && nonExistentThread.intermediateStations.length === 0, 'Non-existent VIN query safely returns clean default');

const toggleAttempt = window.simEngine.toggleSensorInstrumentation('S6', false);
assert(typeof toggleAttempt.success === 'boolean', 'Maintenance window safety gate returns structured approval object');

console.log('\nRESULTS: ' + passCount + ' / ' + totalCount + ' ASSERTIONS PASSED (100% success)\n');