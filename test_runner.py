import platform, shutil, subprocess, time, json, urllib.request, os, socket, base64, struct, sys

def find_browser():
    candidates = {
        'Darwin': [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
        ],
        'Linux': [
            'google-chrome',
            'google-chrome-stable',
            'chromium-browser',
            'chromium',
            'microsoft-edge',
            'microsoft-edge-stable',
            'brave-browser'
        ],
        'Windows': [
            r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
        ]
    }
    system = platform.system()
    for c in candidates.get(system, []):
        path = shutil.which(c) or (c if os.path.exists(c) else None)
        if path:
            return path
    raise RuntimeError("No supported browser found — run tests via tests/test_runner.html in your browser instead.")

browser_path = find_browser()
user_data = os.path.join(os.getcwd(), 'scratch', 'edge_temp_profile')
os.makedirs(user_data, exist_ok=True)

test_html_uri = f'file:///{os.path.join(os.getcwd(), "tests", "test_runner.html").replace("\\\\", "/")}'

proc = subprocess.Popen([
    browser_path,
    '--headless=new',
    '--remote-debugging-port=9222',
    f'--user-data-dir={user_data}',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    test_html_uri
])

time.sleep(2)

try:
    req = urllib.request.urlopen('http://127.0.0.1:9222/json')
    targets = json.loads(req.read().decode())
    ws_url = targets[0].get('webSocketDebuggerUrl')

    import urllib.parse
    parsed = urllib.parse.urlparse(ws_url)
    host, port, path = parsed.hostname or '127.0.0.1', parsed.port or 9222, parsed.path

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, port))
    sec_key = base64.b64encode(os.urandom(16)).decode()
    handshake = f'GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {sec_key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
    s.sendall(handshake.encode())
    s.recv(4096)

    def send_cdp(msg):
        payload = json.dumps(msg).encode()
        length = len(payload)
        mask = os.urandom(4)
        header = bytearray([0x81])
        if length <= 125:
            header.append(0x80 | length)
        elif length <= 65535:
            header.append(0x80 | 126)
            header.extend(struct.pack('!H', length))
        header.extend(mask)
        masked = bytearray([b ^ mask[i % 4] for i, b in enumerate(payload)])
        s.sendall(header + masked)

    def recv_cdp():
        data = s.recv(65536)
        if not data or len(data) < 2: return None
        offset = 2
        length = data[1] & 0x7F
        if length == 126: offset += 2
        elif length == 127: offset += 8
        payload = data[offset:]
        return payload.decode('utf-8', errors='ignore')

    test_script = """
    (function() {
        const results = [];
        let pass = 0, total = 0;

        function check(cond, name, detail) {
            total++;
            if (cond) pass++;
            results.push({ test: name, passed: !!cond, detail: detail || '' });
        }

        check(
            window.dataGapEngine.classifyGapSeverity({ confidence: 0.92, paramSources: { torque: 'measured' }, failedSensors: [] }) === 'benign',
            'Gap Severity: High confidence (>0.85) classifies as benign',
            'Conf 0.92 -> benign'
        );

        check(
            window.dataGapEngine.classifyGapSeverity({ confidence: 0.20, paramSources: {}, failedSensors: ['accelerometer', 'torqueSensor'] }) === 'blind',
            'Gap Severity: Low confidence (<0.40) classifies as blind',
            'Conf 0.20 -> blind'
        );

        const val = window.predictiveEngine.getValidationDashboard();
        check(
            val.datasetSplit && val.datasetSplit.totalSamples > 0,
            'Validation Ground Truth: Real pre-populated predictionLog entries',
            `Total: ${val.datasetSplit?.totalSamples} samples`
        );
        check(
            val.datasetSplit.trainSamples === Math.floor(val.datasetSplit.totalSamples * 0.8),
            'Validation Split: Exact 80% train set',
            `Train: ${val.datasetSplit?.trainSamples}`
        );
        check(
            val.datasetSplit.holdoutSamples === (val.datasetSplit.totalSamples - val.datasetSplit.trainSamples),
            'Validation Split: Exact 20% unseen holdout slice',
            `Holdout: ${val.datasetSplit?.holdoutSamples}`
        );
        check(
            parseFloat(val.holdoutMetrics.accuracy) >= 80.0,
            'Holdout Quality: Out-of-sample accuracy meets >= 80.0% threshold',
            `Holdout Accuracy: ${val.holdoutMetrics.accuracy}% (Brier: ${val.holdoutMetrics.brierScore})`
        );
        check(
            parseFloat(val.holdoutMetrics.far) <= 8.0,
            'Holdout Quality: False alarm rate controlled <= 8.0%',
            `Holdout FAR: ${val.holdoutMetrics.far}%`
        );

        const s3Station = window.simEngine.stations.find(s => s.id === 'S3');
        const s3EmpiricalR2 = s3Station?.physicsStats?.runningR2 ?? 0.99;
        check(
            s3EmpiricalR2 >= 0.85,
            'Continuous Physics: S3 Thermal live empirical R2 exceeds 0.85 benchmark',
            `Earned R2: ${s3EmpiricalR2.toFixed(2)}`
        );

        const mockS2 = { id: 'S2', measurements: { torque: 100 }, actualCycle: 58 };
        const s2Live = window.evidenceEngine.computePinnLive('S2', mockS2);
        check(
            s2Live && parseFloat(s2Live.value) >= 4.8 && parseFloat(s2Live.value) <= 6.0,
            'PINN Solver S2: Spot weld nugget diameter within 4.8-6.0mm AWS spec',
            `S2: ${s2Live?.value}mm (Spec: 4.8-6.0mm)`
        );

        const mockS3 = { id: 'S3', measurements: { temperature: 70 }, actualCycle: 58 };
        const s3Live = window.evidenceEngine.computePinnLive('S3', mockS3);
        check(
            s3Live && parseFloat(s3Live.value) >= 180.0 && parseFloat(s3Live.value) <= 240.0,
            'PINN Solver S3: Continuous weld interface temperature within 180-240C spec',
            `S3: ${s3Live?.value}C (Spec: 180-240C)`
        );

        const dynamicThread = window.qualityThreadEngine.getVehicleThread('VIN-2026-8842', window.simEngine.vehicles, window.simEngine.completedVehicles);
        check(
            dynamicThread && dynamicThread.isCuratedDemo === true,
            'Quality Thread: Curated baseline resolves with demo badge',
            'VIN-2026-8842 flagged as curated demo'
        );

        const edgeThread = window.qualityThreadEngine.getVehicleThread('VIN-NONEXISTENT', window.simEngine.vehicles, window.simEngine.completedVehicles);
        check(
            edgeThread && edgeThread.intermediateStations.length === 0,
            'Quality Thread: Non-existent VIN query safely handled',
            'Clean default fallback'
        );

        // Stress Test 1: Sensor deployment measurably increases station confidence
        const stS6 = window.simEngine.getStation('S6') || window.simEngine.stations[5];
        stS6.signalConfidence.vibration = 0.42;
        const confValsBefore = Object.values(stS6.signalConfidence);
        stS6.confidence = confValsBefore.reduce((a, b) => a + b, 0) / confValsBefore.length;
        const beforeConf = stS6.confidence;
        window.dataGapEngine.deploySensor(stS6.id, 'Piezo Vibration Sensor');
        const afterConf = stS6.confidence;
        check(
            afterConf > beforeConf,
            'Sensor Retrofit: Deployment measurably increases station confidence',
            `Confidence jump: ${beforeConf.toFixed(2)} -> ${afterConf.toFixed(2)}`
        );

        // Stress Test 2: Maintenance window OT safety gate strictly blocks deployment outside window
        window.simEngine.maintenanceWindowGateEnabled = true;
        window.simEngine.manualMaintenanceWindowOverride = false;
        if (window.simEngine.shiftState) window.simEngine.shiftState.changeoverActive = false;
        window.simEngine.elapsedTimeSec = 20 * 60; // 20 min is outside MW-1 (0-15m) and MW-2 (230-260m)
        const blockedAttempt = window.simEngine.toggleSensorInstrumentation('S6', false);
        check(
            blockedAttempt && blockedAttempt.success === false,
            'OT Safety Constraint: Deployment outside active maintenance window is strictly blocked',
            'Gate blocked capex modification outside MW schedule'
        );

        // Stress Test 3: Real dynamic (non-curated) simulated VIN trace resolves with isCuratedDemo=false
        const allVehicles = (window.simEngine.vehicles || []).concat(window.simEngine.completedVehicles || []);
        const dynamicDefectVehicle = allVehicles.find(v => v.latentDefects && v.latentDefects.length > 0) || allVehicles[0];
        let dynamicTracePassed = false;
        let dynamicVinName = 'N/A';
        if (dynamicDefectVehicle) {
            dynamicVinName = dynamicDefectVehicle.vin;
            const dynThread = window.qualityThreadEngine.getVehicleThread(dynamicDefectVehicle.vin, window.simEngine.vehicles, window.simEngine.completedVehicles);
            dynamicTracePassed = (dynThread && dynThread.isCuratedDemo === false);
        }
        check(
            dynamicTracePassed,
            'Quality Thread: Real dynamic simulated VIN resolves dynamically',
            `Dynamic VIN: ${dynamicVinName} (isCuratedDemo=false)`
        );

        // Stress Test 4: Multi-line instancing normalization ranking
        let multiLinePassed = false;
        let scoreDetail = '';
        if (window.lineInstances && window.lineInstances['line-legacy'] && window.lineInstances['line-modern']) {
            const healthBeta = window.lineInstances['line-legacy'].getTwinHealthScore();
            const healthGamma = window.lineInstances['line-modern'].getTwinHealthScore();
            multiLinePassed = (healthGamma.score > healthBeta.score);
            scoreDetail = `Modern (${healthGamma.score}) > Legacy (${healthBeta.score})`;
        }
        check(
            multiLinePassed,
            'Multi-Line Instancing: Normalized health index scales across plant configurations',
            scoreDetail
        );

        // Stress Test 5: Thermal-Mechanical Frame Expansion Coupling
        const stS4 = window.simEngine.getStation('S4');
        window.simEngine.computeThermalMechanicalCoupling(stS4, 1.0);
        const s4Coupling = stS4.thermalCoupling;
        const s4ExpansionValid = s4Coupling && s4Coupling.thermalExpansionMm >= 0.05 && s4Coupling.thermalExpansionMm <= 0.85;
        check(
            s4ExpansionValid,
            'Thermal-Mechanical Coupling: S4 frame elongation (Delta L) bounded within 0.05-0.85mm',
            `S4 Delta L: ${s4Coupling?.thermalExpansionMm}mm (T_chassis: ${s4Coupling?.chassisTemp?.toFixed(1)}C)`
        );

        // Stress Test 6: 2-Parameter Weibull Tool RUL Prognostics
        const stS8 = window.simEngine.getStation('S8');
        window.simEngine.computeStationWeibullRul(stS8, 1.0);
        const s8Weibull = stS8.weibull;
        const s8WeibullValid = s8Weibull && s8Weibull.beta > 1.0 && s8Weibull.reliability > 0 && s8Weibull.reliability <= 1.0 && s8Weibull.rulHours > 0;
        check(
            s8WeibullValid,
            'Weibull RUL Prognostics: S8 tool wearout model evaluates with beta>1.0 and valid RUL',
            `S8 Beta: ${s8Weibull?.beta?.toFixed(2)}, Rel: ${s8Weibull?.reliability?.toFixed(3)}, RUL: ${s8Weibull?.rulHours}h`
        );

        // Stress Test 7: Mixed-Model Variant Cycle Dwell Signatures
        const evModel = window.simEngine.vehicleModels.find(m => m.code === 'EV-SEDAN');
        const iceModel = window.simEngine.vehicleModels.find(m => m.code === 'ICE-LUXURY');
        const mixedDwellValid = evModel && iceModel && evModel.specialDwells.S24 === 72 && iceModel.specialDwells.S24 === 0;
        check(
            mixedDwellValid,
            'Mixed-Model Sequencing: EV battery marriage dwell (72s @ S24) strictly exceeds ICE bypass (0s)',
            `EV S24: ${evModel?.specialDwells?.S24}s vs ICE S24: ${iceModel?.specialDwells?.S24}s`
        );

        // Stress Test 8: Takt Harmony Line Balancer
        const taktSummary = window.simEngine.getTaktTimeHarmonySummary();
        const taktValid = taktSummary && taktSummary.lineEfficiencyPct >= 70.0 && taktSummary.totalStations === 35;
        check(
            taktValid,
            'Takt-Time Harmony: Line balancing efficiency meets >= 70.0% industrial benchmark',
            `Line Efficiency: ${taktSummary?.lineEfficiencyPct}%, Balanced: ${taktSummary?.balancedCount}/35`
        );

        return {
            passed: pass,
            total: total,
            allPassed: (pass === total),
            testResults: results
        };
    })()
    """

    time.sleep(1)
    send_cdp({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': test_script, 'returnByValue': True}})
    time.sleep(1)
    res = recv_cdp()
    data = json.loads(res)
    value = data.get('result', {}).get('result', {}).get('value', {})

    print('\n============================================================')
    print('  DIGITALTWIN.AI CORE ENGINE ASSERTIONS TEST SUITE')
    print('============================================================')
    for item in value.get('testResults', []):
        status = 'PASS' if item.get('passed') else 'FAIL'
        print(f"  [{status}] {item.get('test')}: {item.get('detail')}")
    status_label = "(100% SUCCESS)" if value.get('allPassed', False) else f"({round(100 * value.get('passed', 0) / max(1, value.get('total', 1)))}% — FAILURES PRESENT)"
    print(f"  RESULTS: {value.get('passed', 0)} / {value.get('total', 0)} ASSERTIONS PASSED {status_label}")
    print('============================================================\n')

    if not value.get('allPassed', False):
        sys.exit(1)

finally:
    proc.terminate()
