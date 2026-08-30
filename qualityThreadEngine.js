// ================================================================
// Curated demo scenarios for reliable live walkthrough.
// The dynamic engine below handles all real-time simulated VINs.
// ================================================================
const CURATED_DEMO_PASSPORTS = {
    'VIN-2026-8842': {
        vin: 'VIN-2026-8842',
        model: 'SUV-EV Pro',
        originStation: 'S4',
        originStationName: 'Body Station 4',
        originDefect: 'Torque Under-specification — Cause: Equipment Wear',
        originSensorStatus: 'STALE',
        detectedAtStation: 'S32',
        detectedStationName: 'Assembly Station 32',
        defectType: 'Structural Integrity',
        cause: 'Equipment Wear',
        secondaryCause: 'Process Stress',
        severity: 'major',
        surfaced: true,
        stressScore: 78,
        intermediateStations: ['S5', 'S10', 'S15', 'S20', 'S25', 'S30'],
        blindSpotsTraversed: ['S6', 'S12', 'S18'],
        isCuratedDemo: true
    },
    'VIN-2026-8847': {
        vin: 'VIN-2026-8847',
        model: 'GT-EV Performance',
        originStation: 'S16',
        originStationName: 'Paint Station 16',
        originDefect: 'Thermal Runaway — Cause: Environmental (Humidity >60%)',
        originSensorStatus: 'INFERRED',
        detectedAtStation: 'S32',
        detectedStationName: 'Assembly Station 32',
        defectType: 'Coating Delamination',
        cause: 'Environmental',
        secondaryCause: 'Operator Variation',
        severity: 'critical',
        surfaced: true,
        stressScore: 85,
        intermediateStations: ['S17', 'S20', 'S25', 'S30'],
        blindSpotsTraversed: ['S22', 'S26'],
        isCuratedDemo: true
    }
};

class QualityThreadEngine {
    getVehicleThread(vin, vehicles, completedVehicles) {
        let allVehicles = (vehicles || []).concat(completedVehicles || []);
        let v = allVehicles.find(x => x && x.vin === vin);

        // 1. Dynamic trace for real-time simulated in-flight vehicles with latent or surfaced defects
        if (v && v.latentDefects && v.latentDefects.length > 0) {
            let primaryDefect = v.latentDefects[0];
            let originIdx = parseInt(primaryDefect.originStation.replace('S', '')) || 1;
            let currentIdx = (typeof v.stationIdx === 'number' ? v.stationIdx : 0) + 1;
            let detectIdx = primaryDefect.surfaced ? (parseInt(primaryDefect.surfacedAt.replace('S', '')) || currentIdx) : currentIdx;

            let intermediate = [];
            let blindspots = [];
            
            if (originIdx < detectIdx) {
                for (let i = originIdx + 1; i <= detectIdx; i++) {
                    let sid = 'S' + i;
                    intermediate.push(sid);
                    let st = window.simEngine ? window.simEngine.getStation(sid) : null;
                    if (st && (!st.instrumented || st.sensorCoverage === 'INFERRED' || st.sensorCoverage === 'UNKNOWN' || (st.failedSensors && st.failedSensors.length > 0))) {
                        blindspots.push(sid);
                    }
                }
            }

            return {
                vin: vin,
                model: v.model ? v.model.type : 'SUV-EV Pro',
                originStation: primaryDefect.originStation,
                originStationName: `Station ${primaryDefect.originStation.replace('S', '')} (${primaryDefect.originZone || 'Process'})`,
                originDefect: `${primaryDefect.defectType || 'Process Anomaly'} — Cause: ${primaryDefect.cause || 'Equipment Wear'}${primaryDefect.secondaryCause ? ` + ${primaryDefect.secondaryCause}` : ''}`,
                originSensorStatus: window.simEngine?.getStation(primaryDefect.originStation)?.sensorCoverage || 'STANDARD',
                detectedAtStation: primaryDefect.surfaced ? primaryDefect.surfacedAt : null,
                detectedStationName: primaryDefect.surfaced ? `Inspection Gate @ ${primaryDefect.surfacedAt}` : 'In-Transit (Pending Next Gate)',
                defectType: primaryDefect.defectType || 'Process Anomaly',
                cause: primaryDefect.cause || 'Equipment Wear',
                secondaryCause: primaryDefect.secondaryCause || null,
                severity: primaryDefect.severity || 'minor',
                surfaced: !!primaryDefect.surfaced,
                stressScore: Math.round((primaryDefect.stressAtInjection || 0.5) * 100),
                intermediateStations: intermediate,
                blindSpotsTraversed: blindspots,
                isCuratedDemo: false,
                qualityPassport: this.generateDynamicPassport(v, primaryDefect)
            };
        }

        // 2. Check if requested VIN is one of the curated walkthrough demos
        if (CURATED_DEMO_PASSPORTS[vin]) {
            const demo = CURATED_DEMO_PASSPORTS[vin];
            return Object.assign({}, demo, {
                isCuratedDemo: true,
                qualityPassport: this.generateSimulatedPassport(32, true, demo.originStation)
            });
        }

        // 3. Dynamic clean in-flight or completed vehicle
        let passport = v ? this.generateDynamicPassport(v, null) : this.generateSimulatedPassport(35, false, null);

        return {
            vin: vin || 'VIN-UNKNOWN',
            model: v?.model?.type || 'Standard',
            originStation: null,
            originStationName: null,
            originDefect: null,
            originSensorStatus: null,
            detectedAtStation: null,
            detectedStationName: null,
            defectType: 'None',
            cause: 'None',
            surfaced: false,
            stressScore: 0,
            intermediateStations: [],
            blindSpotsTraversed: [],
            isCuratedDemo: false,
            qualityPassport: passport
        };
    }

    generateDynamicPassport(vehicle, primaryDefect) {
        let passport = [];
        const maxStation = Math.min(35, (typeof vehicle.stationIdx === 'number' ? vehicle.stationIdx : 34) + 1);
        
        // If vehicle has path[] logging from Layer 3, utilize real historical station passings
        if (vehicle.path && vehicle.path.length > 0) {
            vehicle.path.forEach(entry => {
                const sid = entry.stationId || 'S1';
                const isOrigin = primaryDefect && sid === primaryDefect.originStation;
                passport.push({
                    station: sid,
                    measurements: entry.measurements || { torque: 120 + Math.random()*2, temp: 25 + Math.random(), vibration: 0.1 + Math.random()*0.02 },
                    status: isOrigin ? 'Flagged' : 'Pass',
                    defect: isOrigin ? primaryDefect : null,
                    tickIn: entry.tickIn,
                    tickOut: entry.tickOut
                });
            });
            return passport;
        }

        for (let i = 1; i <= maxStation; i++) {
            let sid = 'S' + i;
            let status = 'Pass';
            if (primaryDefect && sid === primaryDefect.originStation) status = 'Flagged';
            passport.push({
                station: sid,
                measurements: { torque: 120 + Math.random()*2, temp: 25 + Math.random(), vibration: 0.1 + Math.random()*0.02 },
                status: status,
                defect: (primaryDefect && sid === primaryDefect.originStation) ? primaryDefect : null
            });
        }
        return passport;
    }

    generateSimulatedPassport(length, hasDefect, defectStation) {
        let passport = [];
        for (let i = 1; i <= length; i++) {
            let sid = 'S' + i;
            let status = 'Pass';
            if (hasDefect && sid === defectStation) status = 'Flagged';
            passport.push({
                station: sid,
                measurements: { torque: 120 + Math.random()*2, temp: 25 + Math.random(), vibration: 0.1 + Math.random()*0.02 },
                status: status
            });
        }
        return passport;
    }

    getNetworkGraphData(vin) {
        let nodes = [];
        let edges = [];
        let defectPath = [];

        let allVehicles = (window.simEngine?.vehicles || []).concat(window.simEngine?.completedVehicles || []);
        let v = allVehicles.find(x => x.vin === vin);
        let defect = v?.latentDefects?.[0];

        let originIdx = defect ? parseInt(defect.originStation.replace('S', '')) : (vin === 'VIN-2026-8842' ? 4 : (vin === 'VIN-2026-8847' ? 16 : 0));
        let detectIdx = defect ? (defect.surfaced ? parseInt(defect.surfacedAt.replace('S', '')) : (v.stationIdx + 1)) : (vin === 'VIN-2026-8842' ? 32 : (vin === 'VIN-2026-8847' ? 32 : 0));

        for (let i = 1; i <= 35; i++) {
            let sid = 'S' + i;
            let type = 'normal';
            let st = window.simEngine?.getStation(sid);
            let isBlind = st && (st.sensorCoverage === 'INFERRED' || st.sensorCoverage === 'UNKNOWN');

            if (originIdx > 0 && i === originIdx) {
                type = 'origin';
            } else if (detectIdx > 0 && i === detectIdx) {
                type = 'detection';
            } else if (isBlind) {
                type = 'blindspot';
            }

            if (originIdx > 0 && detectIdx > 0 && i >= originIdx && i <= detectIdx) {
                defectPath.push(sid);
            }

            nodes.push({
                id: sid,
                name: 'Station ' + i,
                zone: i <= 10 ? 'Body' : (i <= 20 ? 'Paint' : 'Assembly'),
                type: type
            });

            if (i < 35) {
                edges.push({ from: 'S' + i, to: 'S' + (i + 1), weight: 1 });
            }
        }

        return {
            nodes: nodes,
            edges: edges,
            defectPath: defectPath
        };
    }

    getBackwardTraceRecallSet(stationIdOrVin) {
        if (!window.simEngine) return null;
        let stationId = stationIdOrVin;
        if (stationIdOrVin && stationIdOrVin.startsWith('VIN')) {
            let thread = this.getVehicleThread(stationIdOrVin, window.simEngine.vehicles, window.simEngine.completedVehicles);
            stationId = thread?.originStation || 'S4';
        }
        return window.simEngine.generateRecallSet(stationId || 'S4');
    }
}

if (typeof window !== 'undefined') {
    window.qualityThreadEngine = new QualityThreadEngine();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = QualityThreadEngine;
}
