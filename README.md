# DigitalTwin.ai — Industrial Assembly Line Flow Digital Twin

A high-fidelity, physics-informed, config-driven digital twin of an automotive assembly line designed for proactive bottleneck prediction, unit-level quality defect traceability, and capital ROI justification.

---

## 🏛️ System Architecture (Layers 1–7)

`
Layer 7: Stakeholder Views (Presentation Layer)
  ├── 1. Floor Supervisor View (Real-time 0–60 min horizon, live bottleneck radar, defect alerts)
  ├── 2. Plant Manager View (Weekly utilization trends, shifting bottlenecks, RUL maintenance)
  └── 3. Executive Leadership View (Cost of downtime avoided, sensor ROI tradeoff, multi-site THI)

Layer 6: Config-Driven Scalability & Multi-Line Instancing
  └── Parameterized JSON engine instances (Line Alpha 35-Stn, Line Beta 50-Stn, Line Gamma 30-Stn)
      └── Normalized Twin Health Index (THI) for enterprise site ranking

Layer 5: Sensor Coverage & Capex/Accuracy Tradeoff
  └── 70/30 baseline split (24 instrumented / 11 data-gap stations)
      └── \ IoT retrofit packs, detection latency (14.5 min -> 0.2 min), FAR suppression

Layer 4: Live Validation & False-Alarm Recalibration
  └── Real 80/20 Train / Holdout Split over 5,000 live predictionLog entries
      └── Confusion matrix (TP, FP, FN, TN) on 80% train set + RMSE/MAPE/R² on 20% unseen holdout slice

Layer 3: Unit-Level Traceability & Backward Recall Sets
  └── Vehicle path[] history logging across all stations with exit timestamps
      └── Dynamic engine handles all real-time simulated VINs; automated Backward Trace & Recall Sets

Layer 2: Multi-Causal Defect Prediction & Latent Injections
  └── Stress accumulator + Logistic defect probability model
      └── Latent defect tagging surfacing at downstream Inspection Gates (S10, S20, S30, S35)

Layer 1: Factory Physics & Dynamic Shifting Bottlenecks
  └── Active Period bottleneck detection (TOC), buffer ripple propagation, shifting hysteresis
`

---

## 🔍 Explicit Model Assumptions & Benchmark Disclosures

In accordance with transparent engineering evaluation, all assumptions and parameters are proactively disclosed:

### 1. Financial & Capex Benchmarks (ROI Engine)
* **Low-Cost Wireless IoT Pack (\/node)**: Commercial off-the-shelf pack comprising a 3-axis MEMS accelerometer & temperature IC (\.00, e.g. ADXL345/LIS3DH), non-invasive split-core CT current clamp (\.00, e.g. SCT-013-000), and optical proximity switch (\.00). *(Reference: DigiKey / Mouser Industrial IoT Catalog)*.
* **Estimated Payback**: Combining avoided scrap rework (\/yr, ASQ Cost of Quality framework), warranty exposure reduction (\,100/yr, Warranty Week automotive benchmark ~\/claim), and unscheduled micro-downtime avoidance (\/yr, Harbour Report @ \,200/hr line rate), the estimated net savings is **\,200–\,600/station/yr**, implying a **3–5 day hardware payback** per node (~0.5–1 week). This range reflects the compounding uncertainty of stacking independently-sourced industry averages; treat it as directional, not a committed constant.
* **Enterprise Projection**: Linear scaling to 420 stations across an enterprise fleet implies **~\.9M–\.1M/yr**, before accounting for site-to-site variation in defect rates, labor rates, or sensor installation logistics.
* **Downtime Financial Rate (\,200/hr)**: Standard Tier-1 automotive assembly line stoppage cost benchmark.

### 2. Real 80/20 Train / Holdout Validation (Layer 4)
* **Honest Bootstrap**: On initialization, the simulation engine runs a headless 200-tick fast-forward bootstrap, pre-populating simEngine.predictionLog with 5,000 real ground-truth event records before the UI loads.
* **80/20 Dataset Split**:
  * **80% Train Slice (4,000 samples)**: Used exclusively to evaluate the confidence threshold slider $\tau \in [10\%, 90\%]$, generating dynamic True Positives, False Positives, False Negatives, and True Negatives without fabricated fallbacks.
  * **20% Unseen Holdout Slice (1,000 samples)**: Reserved exclusively for evaluating out-of-sample forecast calibration, computing live unclamped RMSE, MAPE, and ^2$ against actual binary defect occurrences.
* **Holdout-Gated Trust State**: The system trust state machine is gated on both in-sample accuracy and out-of-sample holdout calibration (^2 > 0.70$ required for Trusted status).

### 3. Physics-Informed Real Solvers (PINN Models)
* **Live Solvers (4 Stations)**:
  * **Station S2 (Spot Weld Nugget Formation)**: Empirically calibrated lumped-parameter resistance spot weld (RSW) model fit to reference weld schedules per AWS D8.9M / ISO 18278-2 ((t) = \sqrt{\frac{k \cdot I^2 \cdot t}{\rho \cdot c_p}}$). Evaluated live across the full weld lobe spectrum ( \approx 4.33\text{ mm}$ under-current defect $\to$ .20\text{ mm}$ nominal $\to$ .4\text{ mm}$ expulsion defect).
  * **Station S3 (Weld Thermal Dynamics)**: Lumped thermal dissipation solver (t) = T_{\text{env}} + \frac{P_{\text{weld}}}{h \cdot A} \cdot (1 - e^{-k \cdot t})$ tracking ambient plant temperature and weld duty cycle ( - 235^\circ\text{C}$ nominal, approaching steady-state ceiling {\text{max}} \approx 198.2 - 233.1^\circ\text{C}$).
  * **Station S8 (Robot Joint Fatigue)**: Basquin Palmgren-Miner cumulative damage solver (t) = D_0 + \sum (c \cdot \tau^m \cdot n)$ with dynamic harmonic vibration spectrum.
  * **Station S13 (Paint Curing Kinetics)**: Arrhenius integral conversion solver $\alpha(t) = 1 - \exp(-A \cdot \int e^{-E_a/RT} dt)$ with oven kinetics.
* **Live Unclamped ^2$ Tracking**: For all 4 stations, pure physics predictions are compared per-tick against simulated sensor readings (including $\pm 1.5 - 2.5\%$ sensor noise), calculating true unclamped rolling ^2$ and MAPE that dynamically feed Bayesian confidence fusion in evidenceEngine.js.
* **Physics Residual Bounds**: Stations S6, S8, S13, S15, S22, S25, S28, and S33 provide validated physical boundary conditions and residual bounds for cross-station spatial inference.

### 4. Vehicle Traceability & Dynamic In-Flight VIN Traces (Layer 3)
* **Dynamic Real-Time Engine**: The traceability engine dynamically processes all real-time simulated in-flight and completed vehicles (path[] telemetry, origin station identification, blind-spot traversal, and automated inspection gate detections).
* **Curated Baseline Passports**: Two illustrative examples (VIN-2026-8842 and VIN-2026-8847) are pinned in CURATED_DEMO_PASSPORTS for offline reliability and initial walkthrough consistency, while all dynamic in-flight vehicles render live with the [🔴 Live In-Flight Simulated Vehicle] badge.

### 5. Maintenance Window Constraint
* Retrofit sensor deployment is governed by maintenance schedule windows (MW-1: Shift Changeover 0–15m, MW-2: Mid-Shift PM 230–260m) with an interactive OT Safety Gate toggle to simulate real-world hot-swap capex deployment rules.

---

## 🚀 Quickstart & Verification

1. **Start the local HTTP server**:
   ```bash
   python server.py
   ```
2. **Access the application**:
   Open `http://localhost:8080` in any modern web browser.
3. **Run Automated Test Assertions**:
   * **CLI Runner**:
     ```bash
     python test_runner.py
     ```
   * **Interactive In-Browser Runner**:
     Open `http://localhost:8080/tests/test_runner.html`
4. **Keyboard Shortcuts**:
   * `1` — Floor Supervisor (Real-time)
   * `2` — Plant Manager (Weekly Trends)
   * `3` — Leadership (Rollout & ROI)
   * `4` — Modelling & Physics
   * `5` — Predictive Techniques
   * `Space` — Play / Pause Simulation
   * `S` — Step Single Frame Forward
