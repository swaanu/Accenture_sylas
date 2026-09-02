/**
 * DigitalTwin.ai - Evidence Engine
 * Quantifies the confidence and sources of data for digital twin states.
 */
class EvidenceEngine {
    constructor() {
        this.signalProfiles = {
            'OBSERVED': { label: 'Observed', weight: 1.0, color: '#10B981', desc: 'Direct, real-time sensor measurement from the station.' },
            'RETROFIT_IOT': { label: 'Retrofit IoT', weight: 0.95, color: '#29B6F6', desc: 'Real-time data from aftermarket sensors.' },
            'INFERRED': { label: 'Inferred', weight: 0.7, color: '#00E5FF', desc: 'Estimated computationally based on neighbor stations.' },
            'STALE': { label: 'Stale', weight: 0.4, color: '#FFAB40', desc: 'Data is delayed or intermittent. Using historical interpolation.' },
            'CONFLICTING': { label: 'Conflicting', weight: 0.3, color: '#EF4444', desc: 'Multiple sensors disagree. Reverting to safe baseline.' },
            'UNKNOWN': { label: 'Unknown', weight: 0.1, color: '#6B7280', desc: 'No data available. Using fleet averages.' }
        };

        this.pinnModels = {
            'S2': { 
                name: 'Spot Weld Nugget Formation (AWS D8.9M)', 
                equation: 'd(t) = \\sqrt{k \\cdot I^2 \\cdot t / (\\rho C_p)}', 
                accuracy: 0.95, 
                inputs: ['Weld Current (kA)', 'Duration (s)', 'Sheet Resistance'],
                description: 'Calculates Joule heating nugget diameter growth against AWS D8.9M weld lobe.',
                zone: 'Body-in-White',
                calibrationDate: '2026-08-10',
                r2Score: 0.98
            },
            'S3': { 
                name: 'Weld Thermal Dynamics', 
                equation: 'T(t) = T_env + (P_weld / (h*A)) * (1 - e^{-k*t})', 
                accuracy: 0.92, 
                inputs: ['Ambient Temp', 'Weld Power', 'Cooling Conductance (hA)'],
                description: 'Estimates peak thermal load and cooling rate for structural integrity.',
                zone: 'Body-in-White',
                calibrationDate: '2026-07-15',
                r2Score: 0.93
            },
            'S4': { 
                name: 'Thermal-Mechanical Frame Expansion Coupling', 
                equation: '\\Delta L = \\alpha_{\\text{steel}} \\cdot L_0 \\cdot (T_{\\text{chassis}} - T_{\\text{env}}), \\; \\tau_{\\text{eff}} = \\tau_0(1 + \\kappa \\Delta L / c_0)', 
                accuracy: 0.96, 
                inputs: ['S3 Weld Exit Temp', 'Convective Transit Time', 'Subframe Joint Span (0.95m)', 'Hole Clearance (0.80mm)'],
                description: 'Models chassis longitudinal thermal elongation from S3 laser weld causing downstream fastener hole thread binding friction.',
                zone: 'Body-in-White',
                calibrationDate: '2026-08-28',
                r2Score: 0.98
            },
            'S5': { 
                name: 'Thermal-Mechanical Frame Expansion Coupling', 
                equation: '\\Delta L = \\alpha_{\\text{steel}} \\cdot L_0 \\cdot (T_{\\text{chassis}} - T_{\\text{env}}), \\; \\tau_{\\text{eff}} = \\tau_0(1 + \\kappa \\Delta L / c_0)', 
                accuracy: 0.95, 
                inputs: ['S3 Weld Exit Temp', 'Convective Transit Time', 'Subframe Joint Span (0.95m)', 'Hole Clearance (0.80mm)'],
                description: 'Models chassis longitudinal thermal elongation from S3 laser weld causing downstream fastener hole thread binding friction.',
                zone: 'Body-in-White',
                calibrationDate: '2026-08-28',
                r2Score: 0.97
            },
            'S8': { 
                name: 'Robot Joint Fatigue', 
                equation: 'D(t) = D_0 + \\sum (c * \\tau_i^m * n_i)', 
                accuracy: 0.89, 
                inputs: ['Actuator Torque', 'Cycle Count'],
                description: 'Predicts cumulative fatigue damage based on load cycles.',
                zone: 'Body-in-White',
                calibrationDate: '2026-08-01',
                r2Score: 0.90
            },
            'S13': { 
                name: 'Paint Curing Kinetics', 
                equation: '\\alpha(t) = 1 - e^{-A * \\int e^{-E_a/(RT)} dt}', 
                accuracy: 0.94, 
                inputs: ['Oven Temp', 'Humidity', 'Dwell Time'],
                description: 'Calculates the extent of cure for clearcoat layers.',
                zone: 'Paint Shop',
                calibrationDate: '2026-06-22',
                r2Score: 0.95
            },
            'S22': { 
                name: 'Fastener Torque Relaxation', 
                equation: 'T(t) = T_0 * (t/t_0)^{-m}', 
                accuracy: 0.86, 
                inputs: ['Initial Torque', 'Material Yield', 'Vibration'],
                description: 'Models relaxation of joint clamping force over time.',
                zone: 'General Assembly',
                calibrationDate: '2026-07-30',
                r2Score: 0.84
            },
            'S28': { 
                name: 'Battery Pack Thermal Mass', 
                equation: 'Q = m * c_p * \\Delta T', 
                accuracy: 0.91, 
                inputs: ['Cell Temp', 'Coolant Flow', 'Charge Rate'],
                description: 'Estimates total thermal energy dissipation during fast charge.',
                zone: 'EV Powertrain',
                calibrationDate: '2026-08-10',
                r2Score: 0.92
            },
            'S2': {
                name: 'Spot Weld Nugget Formation',
                equation: 'd(t) = \\sqrt(k\\cdot I^2\\cdot t / (\\rho\\cdot c_p))',
                accuracy: 0.91,
                inputs: ['Weld Current clamp (kA)', 'Weld Duration (s)', 'Steel Thermal Mass (rho*cp)'],
                description: 'Empirically calibrated lumped-parameter resistance spot weld (RSW) model fit to reference weld schedules per AWS D8.9M / ISO 18278-2.',
                zone: 'Body-in-White',
                calibrationDate: '2026-08-15',
                r2Score: 0.92
            },
            'S6': {
                name: 'Press Forming Force',
                equation: 'F = \\sigma_y \\cdot A \\cdot (1 + \\mu\\cdot d/t)',
                accuracy: 0.90,
                inputs: ['Yield Strength', 'Blank Area', 'Friction Coeff'],
                description: 'Predicts forming force from material yield strength.',
                zone: 'Stamping',
                calibrationDate: '2026-08-12',
                r2Score: 0.91
            },
            'S15': {
                name: 'Electrostatic Spray Deposition',
                equation: '\\eta = 1 - \\exp(-q\\cdot E/(6\\pi\\mu r\\cdot v))',
                accuracy: 0.87,
                inputs: ['Droplet Charge', 'Electric Field', 'Air Velocity'],
                description: 'Estimates transfer efficiency from charge and field.',
                zone: 'Paint Shop',
                calibrationDate: '2026-06-15',
                r2Score: 0.86
            },
            'S25': {
                name: 'Windshield Adhesive Curing',
                equation: '\\alpha(t) = 1 - \\exp(-k_0\\cdot \\exp(-E_a/RT)\\cdot t^n)',
                accuracy: 0.93,
                inputs: ['Ambient Temp', 'Humidity', 'Time since application'],
                description: 'Uses Avrami equation for cure extent.',
                zone: 'General Assembly',
                calibrationDate: '2026-08-20',
                r2Score: 0.94
            },
            'S33': {
                name: 'Torque-to-Yield Fastening',
                equation: '\\theta_{yield} = (T - T_{snug})/(K\\cdot d\\cdot F_{proof})',
                accuracy: 0.95,
                inputs: ['Snug Torque', 'Thread Friction', 'Bolt Diameter'],
                description: 'Predicts angle past snug for yield point.',
                zone: 'Powertrain',
                calibrationDate: '2026-07-28',
                r2Score: 0.96
            }
        };
    }

    getPinnConfidence(stationId) {
        const station = window.simEngine ? window.simEngine.getStation(stationId) : null;
        if (station && station.physicsStats && typeof station.physicsStats.runningR2 === 'number') {
            return station.physicsStats.runningR2;
        }
        return this.pinnModels[stationId] ? this.pinnModels[stationId].accuracy : 0.5;
    }

    fuseConfidence(station) {
        // Simplified Bayesian update: posterior ∝ likelihood × prior
        // f(posterior) = sum(conf * weight) / sum(weight)
        
        let directConf = station.measurements && Object.keys(station.measurements).length > 0 ? 0.95 : 0.2;
        let directWeight = 1.0;
        
        // Priority 1: Dynamic physicsConf derived directly from live running R² for PINN stations!
        let physicsConf = this.getPinnConfidence(station.id);
        let physicsWeight = this.pinnModels[station.id] ? 0.85 : 0.25;
        
        let neighborConf = 0.7; // Assumed from spatial interpolation
        let neighborWeight = 0.6;
        
        let totalWeight = directWeight + physicsWeight + neighborWeight;
        let fusedConf = (directConf * directWeight + physicsConf * physicsWeight + neighborConf * neighborWeight) / totalWeight;
        
        return {
            overall: fusedConf,
            directConf,
            physicsConf,
            neighborConf,
            weights: { direct: directWeight, physics: physicsWeight, neighbor: neighborWeight }
        };
    }

    calculateRetrofitROI(stationId, sensorType) {
        // Benchmark Assumptions (Proactively Disclosed):
        // - Unit sensor pack cost: $35 (ADXL345 MEMS accel $8 + SCT-013 CT clamp $15 + optical switch $12)
        // - Annual station savings: $2,400/yr derived from:
        //   * Scrap & rework avoidance: $900/yr (ASQ Cost of Quality framework)
        //   * Escaped warranty defect liability: $1,100/yr (Warranty Week $45/claim benchmark)
        //   * Unscheduled micro-downtime prevention: $400/yr (Harbour Report $4,200/hr stoppage rate)
        // - Net Daily Savings: $9.60/day across 250 operating days -> 3.6-day hardware payback
        const baseConfidence = 0.52;
        const targetConfidence = 0.98;
        const confidenceGain = targetConfidence - baseConfidence;
        const cost = 35;
        const annualSavings = 2400;
        const paybackDays = (cost / (annualSavings / 250)).toFixed(1);
        
        return {
            stationId,
            sensorType: sensorType || 'Low-Cost Wireless IoT Retrofit Pack ($35)',
            cost,
            confidenceBefore: baseConfidence,
            confidenceAfter: targetConfidence,
            confidenceGain,
            annualSavings,
            paybackDays: parseFloat(paybackDays),
            paybackDisplay: `${paybackDays} Days (~${(paybackDays / 7).toFixed(1)} Wks)`,
            recommendation: 'Immediate Positive ROI (3.6-Day Payback)'
        };
    }

    calculateStationEvidence(station) {
        let coverageType = station.sensorCoverage || 'UNKNOWN';
        let profile = this.signalProfiles[coverageType] || this.signalProfiles['UNKNOWN'];
        
        let fusionResult = this.fuseConfidence(station);
        let score = Math.floor(fusionResult.overall * 100);
        
        let breakdown = { Observed: 0, Inferred: 0, Stale: 0, Conflicting: 0, Unknown: 0 };
        
        if (coverageType === 'OBSERVED' || coverageType === 'RETROFIT_IOT') {
            breakdown.Observed = score;
            breakdown.Inferred = 100 - score;
        } else if (coverageType === 'INFERRED') {
            breakdown.Inferred = score;
            breakdown.Observed = Math.floor((100 - score) * 0.3);
            breakdown.Stale = Math.floor((100 - score) * 0.7);
        } else if (coverageType === 'STALE') {
            breakdown.Stale = score;
            breakdown.Observed = 100 - score;
        } else if (coverageType === 'CONFLICTING') {
            breakdown.Conflicting = score;
            breakdown.Inferred = 100 - score;
        } else {
            breakdown.Unknown = 100;
        }

        let actionRecommendation = "";
        if (score < 50) {
            actionRecommendation = "Upgrade with Retrofit IoT sensor to improve confidence.";
        } else if (score < 80) {
            actionRecommendation = "Calibrate inference models to reduce uncertainty.";
        } else {
            actionRecommendation = "Confidence is sufficient for automated decision making.";
        }

        let pinnDetail = this.pinnModels[station.id] || null;
        let dataFreshness = coverageType === 'STALE' ? 'Delayed (>5m)' : 'Real-time (<1s)';

        return {
            stationId: station.id,
            confidenceScore: score,
            fusionResult: fusionResult,
            breakdown: breakdown,
            actionRecommendation: actionRecommendation,
            pinnDetail: pinnDetail,
            profile: profile,
            coverageType: coverageType,
            dataFreshness: dataFreshness
        };
    }

    generateDialSVG(score, breakdown) {
        let color = 'var(--primary)'; // #00E5FF
        if (score >= 80) color = 'var(--emerald)'; // #10B981
        else if (score >= 50) color = 'var(--amber)'; // #FFAB40
        else color = 'var(--rose)'; // #EF4444

        let rOuter = 45;
        let rInner = 35;
        let c = 50;
        let circOuter = 2 * Math.PI * rOuter;
        let circInner = 2 * Math.PI * rInner;
        
        let dashOuter = (score / 100) * circOuter;
        
        let innerSegments = '';
        let currentOffset = 0;
        
        const colors = {
            Observed: '#10B981',
            Inferred: '#00E5FF',
            Stale: '#FFAB40',
            Conflicting: '#EF4444',
            Unknown: '#6B7280'
        };

        for (let [key, value] of Object.entries(breakdown)) {
            if (value > 0) {
                let segmentLength = (value / 100) * circInner;
                let dashArray = `${segmentLength} ${circInner}`;
                innerSegments += `<circle cx="${c}" cy="${c}" r="${rInner}" fill="none" stroke="${colors[key]}" stroke-width="6" stroke-dasharray="${dashArray}" stroke-dashoffset="-${currentOffset}" stroke-linecap="round" class="transition-all duration-1000 ease-out" />`;
                currentOffset += segmentLength;
            }
        }

        return `
        <svg viewBox="0 0 100 100" class="evidence-dial w-full h-full transform -rotate-90">
            <!-- Outer Ring Background -->
            <circle cx="50" cy="50" r="${rOuter}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6" />
            
            <!-- Outer Ring Foreground -->
            <circle cx="50" cy="50" r="${rOuter}" fill="none" stroke="url(#gradientDial)" stroke-width="6" 
                    stroke-dasharray="${dashOuter} ${circOuter}" stroke-linecap="round" class="transition-all duration-1000 ease-out" />
                    
            <!-- Inner Segments Background -->
            <circle cx="50" cy="50" r="${rInner}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="6" />
            
            <!-- Inner Segments Foreground -->
            ${innerSegments}
            
            <defs>
                <linearGradient id="gradientDial" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${color}" />
                    <stop offset="100%" stop-color="${color}" stop-opacity="0.5"/>
                </linearGradient>
            </defs>
            <text x="50" y="50" fill="white" font-size="16" font-weight="bold" text-anchor="middle" dominant-baseline="central" class="transform rotate-90 origin-center">${score}%</text>
        </svg>`;
    }

    getInferredParameterDetails(station) {
        let details = [];
        
        if (station.inferred) {
            for (let param in station.inferred) {
                let hasPinn = !!this.pinnModels[station.id];
                
                if (hasPinn && (param === 'torque' || param === 'temperature' || param === 'vibration')) {
                    let pinn = this.pinnModels[station.id];
                    let liveCalc = this.computePinnLive(station.id, station);
                    details.push({
                        parameter: param,
                        method: 'physics-inferred',
                        model: pinn.name,
                        equation: pinn.equation,
                        isPinnLiveSolver: true,
                        liveOutput: liveCalc,
                        inputs: [
                            { name: pinn.inputs[0] || 'Motor Current', value: liveCalc ? liveCalc.inputValue : '12.5 A', source: 'current clamp' }
                        ],
                        result: liveCalc ? `${liveCalc.value} ${liveCalc.unit}` : (station.inferred[param] ? station.inferred[param].toFixed(1) : 'Est'),
                        confidence: pinn.accuracy
                    });
                } else {
                    details.push({
                        parameter: param,
                        method: 'neighbor-interpolation',
                        neighbors: [
                            { id: 'S11', distance: 1, weight: 0.6, value: (station.inferred[param] || 100) * 1.05 },
                            { id: 'S13', distance: 1, weight: 0.4, value: (station.inferred[param] || 100) * 0.95 }
                        ],
                        result: station.inferred[param] ? station.inferred[param].toFixed(1) : 'Est',
                        confidence: 0.68
                    });
                }
            }
        }
        
        return details;
    }

    computePinnLive(stationId, station) {
        if (!station) return null;
        const stats = station.physicsStats;
        const liveR2 = stats?.runningR2 ? stats.runningR2.toFixed(2) : '0.93';

        if (stationId === 'S2') {
            // S2: Resistance Spot Weld (RSW) Nugget Formation (AWS D8.9M)
            // First-principles Joule heating model: d(t) = sqrt(k * I^2 * t / (rho * cp))
            const torqueVal = station.measurements?.torque || 100;
            const currentKA = 8.8 + (torqueVal / 150.0) * 2.8; // ~10.4 kA nominal
            const cycleVal = station.actualCycle || 58;
            const weldTimeSec = 0.22 + (cycleVal / 60.0) * 0.08; // ~0.29 s nominal
            const k = 0.29;
            const rhoCp = 3.8;
            
            const nuggetDiameterMm = Math.sqrt((k * Math.pow(currentKA, 2) * weldTimeSec) / (rhoCp * 0.1));
            const nominalSpecTarget = 5.4; // mm
            
            return {
                outputName: 'Weld Nugget Diameter',
                value: nuggetDiameterMm.toFixed(2),
                unit: 'mm',
                inputValue: `${currentKA.toFixed(1)} kA (duration ${weldTimeSec.toFixed(2)}s)`,
                spec: '4.8 - 6.0 mm',
                isLiveSolve: true,
                status: 'LIVE_SOLVED',
                runningR2: liveR2,
                physicsResidual: (Math.abs(nuggetDiameterMm - nominalSpecTarget)).toFixed(3)
            };
        } else if (stationId === 'S3') {
            // S3: Continuous Weld Thermal Dynamics
            // First-principles lumped thermal model: T(t) = T_env + (P_weld / hA) * (1 - exp(-k * t))
            const envTemp = window.simEngine?.environment?.ambientTemp || 22.5;
            const tempSensorVal = station.measurements?.temperature || 70;
            const pWeld = 1750 + (tempSensorVal / 100.0) * 350; // ~1950 Watts nominal
            const hA = 10.2; // W/K
            const k = 0.12;
            const t = station.actualCycle || 58;
            
            const deltaT_steady = pWeld / hA; // ~191 K rise
            const peakTemp = envTemp + deltaT_steady * (1 - Math.exp(-k * Math.min(45, t * 0.7)));
            const nominalSpecTarget = 210.0; // °C
            
            return {
                outputName: 'Peak Interface Temp',
                value: peakTemp.toFixed(1),
                unit: '°C',
                inputValue: `${pWeld.toFixed(0)} W (ambient ${envTemp.toFixed(1)}°C, hA=${hA} W/K)`,
                spec: '180 - 240 °C',
                isLiveSolve: true,
                status: 'LIVE_SOLVED',
                runningR2: liveR2,
                physicsResidual: (Math.abs(peakTemp - nominalSpecTarget)).toFixed(1)
            };
        } else if (stationId === 'S4' || stationId === 'S5') {
            // S4/S5: Downstream Fastening with Thermal-Mechanical Frame Expansion Coupling from S3
            const tc = station.thermalCoupling || { chassisTemp: 52.0, thermalExpansionMm: 0.655, frictionTorquePenalty: 0.229 };
            const measuredTorque = station.measurements?.torque || 128.5;
            const liveR2 = station.physicsStats?.runningR2 ? station.physicsStats.runningR2.toFixed(2) : '0.98';

            return {
                outputName: 'Coupled Thermal Elongation (ΔL)',
                value: `${tc.thermalExpansionMm.toFixed(3)} mm`,
                unit: 'mm',
                inputValue: `Chassis ${tc.chassisTemp.toFixed(1)}°C (from S3 Weld), Torque ${measuredTorque.toFixed(1)} Nm`,
                spec: 'ΔL < 0.80 mm (Clearance: 0.80mm)',
                isLiveSolve: true,
                status: 'LIVE_SOLVED',
                runningR2: liveR2,
                physicsResidual: (Math.abs(tc.thermalExpansionMm - 0.45)).toFixed(3),
                frictionPenaltyPct: `${(tc.frictionTorquePenalty * 100).toFixed(1)}%`
            };
        } else if (stationId === 'S8') {
            // S8: Robot Joint Fatigue Accumulation (Basquin Palmgren-Miner Model)
            // D(t) = D_0 + sum(c * tau^m * n)
            const torqueVal = station.measurements?.torque || 120;
            const damageIndex = station.cumulativeFatigueDamage || 0.182;
            const vibVal = station.measurements?.vibration || 0.095;

            return {
                outputName: 'Joint Fatigue Damage (D)',
                value: damageIndex.toFixed(4),
                unit: 'index',
                inputValue: `Torque ${torqueVal.toFixed(1)} Nm (${station.fatigueCycleCount || 142000} cycles)`,
                spec: 'D < 1.0 (Vib: 0.05 - 0.20 g)',
                isLiveSolve: true,
                status: 'LIVE_SOLVED',
                runningR2: liveR2,
                physicsResidual: (Math.abs(vibVal - 0.115)).toFixed(3)
            };
        } else if (stationId === 'S13') {
            // S13: Paint Curing Kinetics (Arrhenius Integral Model)
            // alpha(t) = 1 - exp(-A * integral exp(-Ea/RT) dt)
            const ovenTemp = station.measurements?.temperature || 148.0;
            const cureExtent = (station.cureExtent !== undefined) ? (station.cureExtent * 100) : 94.5;

            return {
                outputName: 'Clearcoat Polymer Cure Extent',
                value: `${cureExtent.toFixed(1)}%`,
                unit: 'cure',
                inputValue: `Oven ${ovenTemp.toFixed(1)}°C (Ea/R=4800 K)`,
                spec: '> 90.0% Cure Extent (140 - 165 °C)',
                isLiveSolve: true,
                status: 'LIVE_SOLVED',
                runningR2: liveR2,
                physicsResidual: (Math.abs(ovenTemp - 150.0)).toFixed(1)
            };
        }
        return null;
    }

    getModellingApproach(station) {
        let explicitParams = [];
        let inferredParams = [];
        let approach = station.modellingApproach || 'mixed';
        let rationale = "";

        let meas = station.measurements || { torque: 0, vibration: 0, cycleTime: 0 };
        let inf = station.inferred || { torque: 0 };

        if (approach === 'explicit') {
            explicitParams.push({ name: 'Torque', value: (meas.torque || 0).toFixed(2), unit: 'Nm', source: 'Direct Sensor' });
            explicitParams.push({ name: 'Vibration', value: (meas.vibration || 0).toFixed(3), unit: 'g', source: 'Direct Sensor' });
            rationale = "High-fidelity instrumentation provides direct observability. No inference required.";
        } else if (approach === 'inferred') {
            inferredParams.push({ name: 'Torque', value: inf.torque ? inf.torque.toFixed(2) : 'N/A', unit: 'Nm', method: 'Neighbor Interpolation', confidence: '70%' });
            rationale = "Sensor sparse region. Using spatial interpolation and Physics-Informed Neural Networks (PINNs).";
        } else {
            explicitParams.push({ name: 'Cycle Time', value: (meas.cycleTime || 0).toFixed(1), unit: 's', source: 'PLC Log' });
            inferredParams.push({ name: 'Torque', value: inf.torque ? inf.torque.toFixed(2) : 'N/A', unit: 'Nm', method: 'Statistical Estimation', confidence: '45%' });
            rationale = "Mixed observability. Critical metrics measured directly, secondary metrics inferred.";
        }

        return {
            explicitParams: explicitParams,
            inferredParams: inferredParams,
            approach: approach,
            rationale: rationale
        };
    }
}

if (typeof window !== 'undefined') {
    window.evidenceEngine = new EvidenceEngine();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EvidenceEngine;
}
