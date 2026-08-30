class DataGapEngine {
    constructor() {
        this.engineName = "DataGapEngine";
    }

    // Returns 'benign' | 'managed' | 'degraded' | 'blind'
    classifyGapSeverity(station) {
        if (!station || !station.paramSources || !station.confidence) {
            return 'blind'; // Safe fallback
        }

        const avgConfidence = station.confidence;
        
        // Convert map values to array if necessary to check sources
        let sources = [];
        if (station.paramSources instanceof Map) {
            sources = Array.from(station.paramSources.values());
        } else if (typeof station.paramSources === 'object') {
            sources = Object.values(station.paramSources);
        }

        const hasPhysicsOrNeighbor = sources.some(
            source => source === 'physics-model' || source === 'neighbor-interpolation' || source === 'real-sensor'
        );

        if (avgConfidence > 0.6 && hasPhysicsOrNeighbor) {
            return 'managed';
        } else if (avgConfidence >= 0.3 && avgConfidence <= 0.6) {
            return 'degraded';
        } else if (avgConfidence < 0.3) {
            return 'blind';
        }
        
        return 'benign';
    }

    getConfidenceDegradationCurve(stationId) {
        const station = window.simEngine ? window.simEngine.getStation(stationId) : null;
        if (!station) return [];

        const initialConfidence = station.confidence || 0.8;
        const curve = [];
        
        // Decay lambda depends on typical parameter dynamics
        const lambda = (station.type === 'machining' || station.type === 'joining') ? 0.05 : 0.02;

        for (let min = 0; min <= 60; min += 1.2) { // 50 points over 60 mins
            const timeSinceLastReading = min;
            const confidence = initialConfidence * Math.exp(-lambda * timeSinceLastReading);
            curve.push({
                time: Math.round(min * 10) / 10,
                confidence: Math.max(0, Math.min(1, confidence))
            });
        }
        return curve;
    }

    simulateSensorFailure(stationId, sensorType) {
        const station = window.simEngine ? window.simEngine.getStation(stationId) : null;
        if (!station) return null;

        const confidenceBefore = station.confidence || 0.93;
        let confidenceAfter = confidenceBefore * 0.65; // Arbitrary drop for simulation
        
        let affectedParameters = [];
        if (sensorType === 'accelerometer') affectedParameters = ['vibration'];
        else if (sensorType === 'thermocouple') affectedParameters = ['temperature'];
        else affectedParameters = ['torque', 'temperature']; // default

        let fallbackStrategy = 'neighbor-interpolation';
        if (confidenceAfter < 0.3) fallbackStrategy = 'operator-manual-check';
        else if (confidenceAfter < 0.5) fallbackStrategy = 'fleet-average';

        let severity = 'low';
        if (confidenceAfter < 0.3) severity = 'critical';
        else if (confidenceAfter < 0.6) severity = 'moderate';

        const neighborStations = (window.simEngine && window.simEngine.stations) ? 
            window.simEngine.stations
                .filter(s => Math.abs(parseInt(s.id.replace('S', '')) - parseInt(stationId.replace('S', ''))) <= 2 && s.id !== stationId)
                .map(s => s.id)
                .slice(0, 2) : ['S11', 'S13']; // Mock fallback

        return {
            stationId,
            failedSensor: sensorType,
            affectedParameters,
            fallbackStrategy,
            confidenceBefore: Math.round(confidenceBefore * 100) / 100,
            confidenceAfter: Math.round(confidenceAfter * 100) / 100,
            impactSeverity: severity,
            neighborStations,
            recommendation: `Deploy piezo vibration sensor ($6) for immediate recovery`
        };
    }

    getLowCostSensorCatalog() {
        return [
            // sensorFlags map each device to the real keys on station.sensors
            // that simulationEngine.inferMeasurements() actually checks. The
            // old version set sensors[parameterName] (e.g. sensors.vibration),
            // which doesn't exist on the sensors object and was silently
            // ignored - so "deploying" a sensor never changed anything.
            { type: 'MEMS Accelerometer', cost: 8, parameters: ['vibration'], sensorFlags: ['accelerometer'], confidenceBoost: 0.35, installTime: '15 min', installDifficulty: 'easy', description: 'Low-cost vibration monitoring via MEMS chip. Mounts magnetically.' },
            { type: 'Current Clamp', cost: 15, parameters: ['torque'], sensorFlags: ['currentClamp'], confidenceBoost: 0.30, installTime: '10 min', installDifficulty: 'easy', description: 'Non-invasive AC/DC current measurement. Infers motor torque via I²R model.' },
            { type: 'USB Thermocouple', cost: 12, parameters: ['temperature'], sensorFlags: ['thermocouple'], confidenceBoost: 0.40, installTime: '20 min', installDifficulty: 'easy', description: 'Type-K thermocouple with USB logger. Direct temperature measurement.' },
            { type: 'Acoustic Emission Mic', cost: 25, parameters: ['vibration', 'torque'], sensorFlags: ['accelerometer', 'currentClamp'], confidenceBoost: 0.45, installTime: '30 min', installDifficulty: 'moderate', description: 'Ultrasonic microphone detects bearing wear and tool chatter.' },
            { type: 'Smart Power Strip', cost: 20, parameters: ['cycleTime', 'throughput'], sensorFlags: ['opticalProximity'], confidenceBoost: 0.25, installTime: '5 min', installDifficulty: 'easy', description: 'Measures power draw patterns to infer cycle timing and station activity.' },
            { type: 'Piezo Vibration Sensor', cost: 6, parameters: ['vibration'], sensorFlags: ['accelerometer'], confidenceBoost: 0.28, installTime: '10 min', installDifficulty: 'easy', description: 'Cheapest vibration option. Adhesive-mount piezo disc.' },
            { type: 'IR Temperature Gun', cost: 18, parameters: ['temperature'], sensorFlags: ['irCamera'], confidenceBoost: 0.38, installTime: '25 min', installDifficulty: 'moderate', description: 'Non-contact infrared thermometer with continuous logging.' }
        ];
    }

    optimizeSensorPlacement(budget) {
        if (!window.simEngine || !window.simEngine.stations) return [];
        
        let currentBudget = budget;
        const catalog = this.getLowCostSensorCatalog();
        const placements = [];
        
        // Deep copy stations to sort them by confidence without mutating the original
        let stationsCopy = window.simEngine.stations.map(s => ({...s}));
        
        // Greedy approach
        while (currentBudget > 0) {
            // Find station with lowest confidence
            stationsCopy.sort((a, b) => (a.confidence || 0) - (b.confidence || 0));
            let targetStation = stationsCopy[0];
            
            if (targetStation.confidence > 0.85) break; // Diminishing returns, no need to over-instrument
            
            // Find best sensor that fits budget (highest confidence boost per dollar)
            let affordableSensors = catalog.filter(s => s.cost <= currentBudget);
            if (affordableSensors.length === 0) break;
            
            affordableSensors.sort((a, b) => (b.confidenceBoost / b.cost) - (a.confidenceBoost / a.cost));
            let bestSensor = affordableSensors[0];
            
            currentBudget -= bestSensor.cost;
            targetStation.confidence = Math.min(1.0, (targetStation.confidence || 0) + bestSensor.confidenceBoost);
            
            placements.push({
                stationId: targetStation.id,
                sensorType: bestSensor.type,
                cost: bestSensor.cost,
                confidenceImprovement: bestSensor.confidenceBoost,
                cumulativeBudget: budget - currentBudget
            });
        }
        
        return placements;
    }

    getGapAnalysisSummary() {
        if (!window.simEngine || !window.simEngine.stations) return null;
        
        const stations = window.simEngine.stations;
        let fullyInstrumented = 0;
        let partiallyInstrumented = 0;
        let sensorBlind = 0;
        let totalConfidence = 0;
        
        const zones = {
            Body: { count: 0, confSum: 0 },
            Paint: { count: 0, confSum: 0 },
            Assembly: { count: 0, confSum: 0 }
        };
        
        const criticalGaps = [];

        stations.forEach(station => {
            totalConfidence += (station.confidence || 0);
            
            let zoneName = station.zone || 'Assembly'; // fallback
            if (!zones[zoneName]) zones[zoneName] = { count: 0, confSum: 0 };
            
            zones[zoneName].count++;
            zones[zoneName].confSum += (station.confidence || 0);
            
            const severity = this.classifyGapSeverity(station);
            if (severity === 'managed' || severity === 'benign') fullyInstrumented++;
            else if (severity === 'degraded') partiallyInstrumented++;
            else if (severity === 'blind') {
                sensorBlind++;
                criticalGaps.push({
                    stationId: station.id,
                    severity: 'blind',
                    recommendation: 'Immediate installation of low-cost MEMS sensor package.'
                });
            }
        });

        // Compute zone averages
        Object.keys(zones).forEach(key => {
            if (zones[key].count > 0) {
                zones[key].avgConf = Math.round((zones[key].confSum / zones[key].count) * 100) / 100;
            } else {
                zones[key].avgConf = 0;
            }
            delete zones[key].confSum; // clean up
        });

        return {
            totalStations: stations.length,
            fullyInstrumented,
            partiallyInstrumented,
            sensorBlind,
            averageConfidence: Math.round((totalConfidence / stations.length) * 100) / 100,
            criticalGaps,
            gapsByZone: zones
        };
    }

    getOperatorChecklist() {
        if (!window.simEngine || !window.simEngine.stations) return [];
        
        const blindStations = window.simEngine.stations.filter(s => (s.confidence || 0) < 0.4);
        const checklist = [];
        
        blindStations.forEach(station => {
            let parameter = 'vibration';
            let method = 'Handheld vibration meter';
            
            if (station.type === 'heating' || station.type === 'paint') {
                parameter = 'temperature';
                method = 'IR Pyrometer';
            } else if (station.type === 'joining') {
                parameter = 'torque';
                method = 'Manual torque wrench check';
            }
            
            checklist.push({
                stationId: station.id,
                parameter: parameter,
                frequency: station.confidence < 0.2 ? 'Every 30 min' : 'Every 2 hours',
                method: method,
                priority: station.confidence < 0.2 ? 'high' : 'medium'
            });
        });
        
        return checklist;
    }

    deploySensor(stationId, sensorType) {
        if (!window.simEngine || !window.simEngine.stations) return { success: false, reason: 'Simulation engine not loaded' };
        
        const station = window.simEngine.getStation(stationId);
        if (!station) return { success: false, reason: 'Station not found' };
        
        const catalog = this.getLowCostSensorCatalog();
        const sensorDef = catalog.find(s => s.type === sensorType);
        
        if (!sensorDef) return { success: false, reason: 'Unknown sensor type' };
        
        // Turn on the real physical sensor flag(s) this device provides (see
        // sensorFlags on the catalog entry), and clear any prior failure
        // marks so inferMeasurements() picks it up as working on the very
        // next tick. The old code set station.sensors[parameterName], which
        // isn't a key inferMeasurements ever checks, so nothing happened.
        if (!station.sensors) station.sensors = {};
        if (!station.failedSensors) station.failedSensors = [];
        (sensorDef.sensorFlags || []).forEach(flag => {
            station.sensors[flag] = true;
            station.failedSensors = station.failedSensors.filter(f => f !== flag);
        });
        
        // Restore confidence and source on the fields the rest of the app
        // actually reads: station.signalConfidence drives the header's
        // "System Trust Score" and every modelling-view confidence bar;
        // station.paramSources drives the source badges. The old code wrote
        // to a station.confidence field that no other part of the sim ever
        // set or read, so a "fix" never visibly moved anything.
        sensorDef.parameters.forEach(param => {
            if (station.signalConfidence && station.signalConfidence[param] !== undefined) {
                station.signalConfidence[param] = Math.min(1.0, station.signalConfidence[param] + sensorDef.confidenceBoost);
            }
            if (station.paramSources && station.paramSources[param] !== undefined) {
                station.paramSources[param] = 'measured';
            }
        });

        // Keep the aggregate scalar (used elsewhere in this engine, e.g.
        // classifyGapSeverity/getGapAnalysisSummary/getOperatorChecklist) in
        // sync with the real per-parameter confidence right away, instead of
        // waiting for the next simulation tick to recompute it.
        if (station.signalConfidence) {
            const vals = Object.values(station.signalConfidence);
            station.confidence = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
        
        return {
            success: true,
            stationId: station.id,
            newConfidence: Math.round((station.confidence || 0) * 100) / 100,
            message: `${sensorType} deployed at ${station.id} — signal confidence restored.`
        };
    }
}

// Attach to window
window.dataGapEngine = new DataGapEngine();
