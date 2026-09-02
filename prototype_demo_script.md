# DigitalTwin.ai / Sylas — Live Interactive Prototype Demo Script

> **Purpose:** A pure **screen-recording & voiceover walkthrough** of the live running prototype (`http://localhost:8080`).  
> **No presentation slides** — 100% focused on clicking, interacting with, and explaining the real software on screen.  
> **Target Duration:** ~5–7 Minutes  
> **Presenters:** Swaraj (Team Leader) & Aman Kumar Singh (Core Engineer), Team Sylas — IIT Kanpur  
> **Recording Setup:** Chrome / Edge at `http://localhost:8080`, Fullscreen (`F11`), 1080p/4K @ 60 FPS.

---

## 🧭 Navigation & Demo Flow at a Glance

```
[1. Boot Sequence] ➔ [2. Conveyor & 3D Modes] ➔ [3. Station Inspector 5 Tabs] 
        ➔ [4. Cascading Thermal Expansion S3→S4] ➔ [5. Zero-Sensor Topological Inference S14] 
        ➔ [6. Quality Thread & Surgical Recall] ➔ [7. Monte Carlo What-If & OT Gate] 
        ➔ [8. Plant Manager Heatmap & Exec THI] ➔ [9. Live Validation & 20/20 Test Suite]
```

---

## 🎬 Step-by-Step Prototype Walkthrough

---

### PART 1: Cyber-Physical Boot & Startup (0:00 – 0:35)

**On Screen:** Browser open at `http://localhost:8080`. Hard refresh (`Ctrl+F5`) to show the initial boot.

* **[ACTION: Let the boot sequence play]**  
  *Watch the terminal text stream `boot-0` through `boot-5`, the animated progress bar, and Team Sylas credentials.*
* **[VOICEOVER - Swaraj]:**  
  > *"Hello everyone, I am Swaraj, Team Leader of Team Sylas from IIT Kanpur, joined by Aman Kumar Singh. Today, we are walking you through the live prototype of **DigitalTwin.ai**—an industrial cyber-physical digital twin engineered for high-volume automotive assembly lines.*  
  >  
  > *When we launch the platform, the client-side engine immediately runs a cyber-physical boot diagnostic. It compiles our continuous First-Principles PINN ODEs, verifies OT safety gates, initializes the 35-station queuing topology, and pre-populates a 500-cycle baseline—running at sub-millisecond execution speeds inside pure ECMAScript with zero framework overhead."*

* **[ACTION: Click the glowing button "ENTER MISSION CONTROL" or press `Space` / `Enter`]**  
  *The overlay smoothly scales and dissolves, revealing the main Mission Control dashboard.*
* **[VOICEOVER - Swaraj]:**  
  > *"Let's click 'Enter Mission Control' and step onto the factory floor."*

---

### PART 2: The Physical Assembly Line & 3D View Modes (0:35 – 1:15)

**On Screen:** Floor Supervisor View (Default View `1`).

* **[ACTION: Move cursor smoothly across the horizontal Conveyor Strip]**  
  *Point to the 3 zones: Body Shop (S1–S10), Paint Shop (S11–S20), and Final Assembly (S21–S35). Hover over a few station cards showing cycle times, circular buffer rings, and moving vehicle sprites.*
* **[VOICEOVER - Aman]:**  
  > *"Here is the full 35-station production line, spanning Body in White, the Paint Shop, and Final Assembly. Each station displays its live operational status, input and output buffer saturation levels, and real-time cycle times benchmarked against our 60-second takt cadence.*  
  >  
  > *At the top right of the conveyor, we can switch rendering modes."*

* **[ACTION: Click `[3D Isometric]` button above the conveyor]**  
  *The conveyor transforms into an isometric 3D spatial grid showing 3D station cubes, animated robotic welding arms, and spatial tracks.*
* **[VOICEOVER - Aman]:**  
  > *"Clicking '3D Isometric' switches our Canvas to a spatial representation with animated robotic kinematic arms and live vehicle transport. We also have an 'Energy & Thermal' mode that renders dynamic power draw and convective heat dissipation across the line."*

* **[ACTION: Click back to `[2D Track]` mode and glance at the bottom Mini-Map]**  
  *Hover over a node on the mini-map to show the floating HUD tooltip, then click a station on the mini-map to jump to it.*
* **[VOICEOVER - Aman]:**  
  > *"At the bottom right, our interactive HiDPI mini-map provides screen-space hit testing, allowing supervisors to jump across the plant instantly with a single click."*

---

### PART 3: First-Principles PINNs & The 5-Tab Station Inspector (1:15 – 2:15)

**On Screen:** Station Inspector drawer on the right side of the screen.

* **[ACTION: Click Station S2 (Resistance Spot Welding)]**  
  *The right drawer slides open with Station S2 details. Point cursor at the PINN physics card.*
* **[VOICEOVER - Swaraj]:**  
  > *"Let's inspect Station S2—Resistance Spot Welding. DigitalTwin.ai does not rely on black-box heuristics or blind averages. Every simulation tick, our Physics-Informed Neural Network numerically integrates the governing Joule heating diffusion equation per AWS D8.9M standards.*  
  >  
  > *With 9,800 Amperes across a 120-micro-ohm dynamic resistance over a 220-millisecond weld time, the solver computes an exact nominal weld nugget diameter of 5.08 millimeters, safely centered in the 4.8 to 6.0 millimeter specification band."*

* **[ACTION: In the Station Inspector, click through all 5 telemetry tabs in sequence]**
  1. **Click `[📈 Oscilloscope]`**: Show the real-time raw electrical current waveform.
  2. **Click `[📊 SPC Limits (Cpk)]`**: Show the Shewhart $\bar{X}-R$ control chart with Upper/Lower Control Limits ($\pm 3\sigma$), $C_{pk}$ and $P_{pk}$ capability metrics, and the 4 Western Electric evaluation rules.
  3. **Click `[⚡ Harmonic Spectrum]`**: Show the 0–500 Hz FFT frequency domain spectrum isolating 1X and 2X bearing fault harmonics at 60 Hz and 120 Hz.
  4. **Click `[🕸️ 6-Axis Radar]`**: Show the live multi-causal polygon plotting Thermal Flux, Torque Preload, Nugget Integrity, Vibration RMS, Buffer WIP, and Topological Trust.
  5. **Click `[📉 Weibull RUL]`**: Show the 2-parameter Weibull reliability survival curve $R(n)$ with shape factor $\beta = 2.80$, characteristic scale $\eta = 5{,}000\text{ h}$, and remaining useful life countdown of 3,632 operating hours.
* **[VOICEOVER - Swaraj]:**  
  > *"Notice how the Station Inspector offers five synchronized diagnostic tabs: live raw oscilloscope, Shewhart Statistical Process Control with automated Western Electric violation alerts, an FFT harmonic vibration analyzer for bearing defect detection, a 6-axis multi-causal capability radar, and a continuous 2-parameter Weibull RUL curve tracking tool wearout under Arrhenius-Eyring stress acceleration."*

---

### PART 4: Cascading Thermal-Mechanical Frame Expansion (S3 ➔ S4 ➔ S5) (2:15 – 2:55)

**On Screen:** Click Station S3, then click Station S4.

* **[ACTION: Click Station S3 (Continuous Laser Welding)]**  
  *Point cursor to the thermal lumped capacitance equation: $T = 212.1^\circ\text{C}$ and empirical $R^2 = 1.00$.*
* **[VOICEOVER - Aman]:**  
  > *"Now, let's look at Station S3. A lumped-capacitance Newton-Fourier heat transfer ODE solves weld interface thermal dissipation live, holding steady at 212.1 degrees Celsius with an empirical R-squared of 1.00.*  
  >  
  > *Now watch what happens when this heat travels downstream. Let's click Station S4."*

* **[ACTION: Click Station S4 (Subframe Fastening)]**  
  *Point cursor directly at the glowing amber badge in the inspector: `ΔL = 0.751 mm → +26.3% TORQUE FRICTION`.*
* **[VOICEOVER - Aman]:**  
  > *"Look at this amber badge at Station S4: 'Delta L = 0.751 millimeters, causing a plus 26.3% torque friction penalty'.*  
  >  
  > *This is a major engineering capability of DigitalTwin.ai: **inter-station cascading physics**. When S3 welds the chassis, sensible heat diffuses across the 0.95-meter subframe fixture. That 0.751 mm longitudinal thermal elongation encroaches on the 0.8 mm bolt hole clearance, binding the bolt threads and driving up fastener friction by 26 percent.*  
  >  
  > *A conventional system would flag S4 as having a broken nutrunner. DigitalTwin.ai knows S4's tool is fine—the root cause is thermal carryover from S3."*

---

### PART 5: The Zero-Sensor Breakthrough — Topological Inference (2:55 – 3:45)

**On Screen:** Main screen, focusing on Station S14 and the central Dependency Network Canvas.

* **[ACTION: In the top bar scenario dropdown, select "Scenario 3: Sensor Blind Spot / Data Gap at S14" (or right-click S14 and choose toggle/fault)]**  
  *Watch the simulation state update.*
* **[VOICEOVER - Swaraj]:**  
  > *"Here is the central dilemma of brownfield manufacturing: What happens when an asset has **no sensors at all**?*  
  >  
  > *Station S14 is a legacy pneumatic clamp with zero transducers—a complete data dark spot. Let's simulate seal leakage at S14, causing its mechanical cycle time to creep upward."*

* **[ACTION: Point cursor to Station S13, then S15, then S14 on the Conveyor]**  
  *Watch S13 output buffer fill up and turn glowing **Amber** (`isBlocked = true`).*  
  *Watch S15 input buffer drain to zero and turn glowing **Purple** (`isStarved = true`).*  
  *Watch S14 light up red in the center with badge `[INFERRED ROOT CONSTRAINT]`.*
* **[VOICEOVER - Swaraj]:**  
  > *"Because mass and flow must be conserved in a serial line, the bottleneck's impedance is mirrored onto its boundaries.*  
  >  
  > *Watch: Upstream at Station S13, finished parts have nowhere to go. Its buffer exceeds 80% saturation, setting `isBlocked` to true—rendered in glowing amber backpressure.*  
  >  
  > *Downstream at Station S15, parts stop arriving. Its input buffer empties, setting `isStarved` to true—rendered in glowing purple starvation."*

* **[ACTION: Point cursor to the central Dependency Network Canvas (`#canvas-dependency-network`)]**  
  *Show the Velocity-Verlet force-directed graph with animated dashed causal rays radiating outward from S14. Toggle the `[Arc Diagram]` button above it to show the 1D projection.*
* **[VOICEOVER - Swaraj]:**  
  > *"Look at our Force-Directed Causal Dependency graph: animated dashed causal rays radiate from the constraint. In just seven simulation ticks, our Phase 6 topological inference evaluates: S13 blocked, S15 starved, S14 unmonitored. It automatically isolates S14 as the true root constraint.*  
  >  
  > *We caught the failure without installing a single dollar of hardware sensors on S14."*

---

### PART 6: Unit-Level Passports & Surgical Recall Bounding (3:45 – 4:25)

**On Screen:** Floating "Quality Thread" pill on the left side of the dashboard.

* **[ACTION: Click the "Quality Thread" pill on the left (or press `Key 3`)]**  
  *The Quality Thread slide-out drawer opens on the left.*
* **[VOICEOVER - Aman]:**  
  > *"Now let's examine quality management. DigitalTwin.ai tracks quality at the individual vehicle level rather than aggregated lot averages. Every chassis moving along the line writes an immutable digital passport.*  
  >  
  > *Let's look at vehicle VIN-2026-8984."*

* **[ACTION: Click on `VIN-2026-8984` in the passport list]**  
  *The passport details open, showing exact dwell times at S1, nugget diameter at S2, thermal anomaly at S3, and the latent defect flag `[Under-Bake Micro-Porosity]`.*
* **[VOICEOVER - Aman]:**  
  > *"Here is its passport: it logs exact dwell durations, tool wear, and thermal histories. At Station S3, it was exposed to a thermal gradient, resulting in a latent under-bake defect."*

* **[ACTION: Click the button "Trace Root Cause ➔" inside the passport]**  
  *The causal backward trace graph algorithm executes. Watch the animated trace backtrack to S3.*
* **[VOICEOVER - Aman]:**  
  > *"When this defect is caught downstream, clicking 'Trace Root Cause' runs our backward trace graph traversal algorithm, backtracking along the assembly tree to isolate the exact origin station and timestamp.*  
  >  
  > *Now look at the Ranked Recall Set below."*

* **[ACTION: Scroll down to the Ranked Recall Set panel]**  
  *Point cursor to: **`12 Suspect Vehicles Isolated | $336,000 Exposure Bounded`**.*
* **[VOICEOVER - Aman]:**  
  > *"Instead of issuing a blanket recall of 5,000 vehicles, the engine calculates temporal exposure decay to quarantine the exact 12 suspect chassis. That is a 99.8% reduction in quarantined inventory, saving over \$336,000 in unnecessary scrap and warranty liability."*

---

### PART 7: Prescriptive What-If, 500-Iteration Monte Carlo & OT Safety (4:25 – 5:05)

**On Screen:** Switch to Prescriptive Interventions View (Press `Key 4` or click top tab).

* **[ACTION: Press `Key 4` on the keyboard]**  
  *The dashboard switches to the Prescriptive Interventions view with speed and buffer sliders.*
* **[VOICEOVER - Swaraj]:**  
  > *"When a bottleneck occurs, supervisors don't have to guess how to fix it. Pressing Key 4 opens our Prescriptive Interventions engine.*  
  >  
  > *Watch what happens when we adjust the line speed or buffer capacity sliders."*

* **[ACTION: Drag the Buffer Capacity slider from `+0` to `+2 units` and Line Speed to `+10%`]**  
  *Watch the 500-Iteration Monte Carlo simulation run live in real time, updating the empirical distribution histogram and displaying the $P_{80}$ line recovery time with 95% confidence intervals.*
* **[VOICEOVER - Swaraj]:**  
  > *"In under 50 milliseconds, the engine runs a 500-iteration stochastic Monte Carlo simulation across all 35 stations, plotting an empirical throughput distribution and calculating the 80th-percentile recovery time.*  
  >  
  > *Now, let's test plant safety. What if someone tries to modify line hardware while production is actively running?"*

* **[ACTION: Click "Deploy Sensor Retrofit" button]**  
  *A red warning modal pops up: `[OT SAFETY GATE: MODIFICATION BLOCKED]`.*
* **[VOICEOVER - Swaraj]:**  
  > *"Notice the red warning: The OT Safety Gate programmatically blocks capex and tooling changes outside scheduled maintenance windows—such as Shift Changeover MW-1 and Mid-Shift PM MW-2. Combined with our passive hardware data diodes, this guarantees zero unauthorized writes to live PLC ladder logic."*

---

### PART 8: Plant Manager Shifting Bottlenecks & Executive ROI (5:05 – 5:35)

**On Screen:** Switch to Plant Manager View (Press `Key 5`), then Executive Leadership View (Press `Key 6`).

* **[ACTION: Press `Key 5` for Plant Manager View]**  
  *Show the 35-station bottleneck migration matrix heatmap over 200 ticks and the Heijunka mixed-model variant optimizer.*
* **[VOICEOVER - Aman]:**  
  > *"For plant managers, pressing Key 5 reveals the 35-station bottleneck migration heatmap across the last 200 ticks, along with our mixed-model Heijunka queue optimizer, which balances EV battery dwell against ICE bypass to cut takt variance by 68 percent.*  
  >  
  > *Now let's switch to the Executive Leadership View."*

* **[ACTION: Press `Key 6` for Executive Leadership View]**  
  *Point cursor to the 3 plant profile cards (Detroit Brownfield, Munich Hybrid, Yokohama Greenfield), the site-normalized Twin Health Index (THI), and the cumulative downtime financial loss ticker.*
* **[VOICEOVER - Aman]:**  
  > *"For executive leadership, our normalized Twin Health Index benchmarks plants of completely different automation levels—from Detroit brownfield lines to Yokohama greenfield gigafactories. Our greedy knapsack sensor placement optimizer delivers a verified hardware payback period of just 3.6 days."*

---

### PART 9: Live Holdout Validation & 20/20 Automated Assertions (5:35 – 6:10)

**On Screen:** Switch to Model Validation View (Press `Key 7`).

* **[ACTION: Press `Key 7` for Model Validation View]**  
  *Point cursor to the 10-seed out-of-sample holdout table ($97.4\% \pm 1.3\%$ accuracy, $1.3\%$ False Alarm Rate, $0.025$ Brier score), and the 4-quadrant confusion matrix.*
* **[VOICEOVER - Swaraj]:**  
  > *"Finally, we believe in radical engineering transparency. DigitalTwin.ai is evaluated on an honest 80/20 train/unseen holdout split across 10 independent random seeds. We achieve 97.4% out-of-sample accuracy with a false alarm rate of just 1.3%, well below the 8% industrial alarm fatigue threshold.*  
  >  
  > *Supervisors can even provide active human-in-the-loop feedback to dynamically recalibrate station stress sensitivity."*

* **[ACTION: Open another browser tab to `http://localhost:8080/tests/test_runner.html` (or show terminal running `python test_runner.py`)]**  
  *Show the terminal green test runner log: `RESULTS: 20 / 20 ASSERTIONS PASSED (100% SUCCESS)`.*
* **[VOICEOVER - Swaraj]:**  
  > *"To ensure bulletproof reliability, our entire platform is backed by an automated 20-point test harness validating every ODE solver, thermal expansion calculation, Weibull hazard curve, and OT safety rule.*  
  >  
  > *All 20 out of 20 automated core engine assertions pass with 100 percent success.*  
  >  
  > *DigitalTwin.ai proves that high-volume manufacturing doesn't need a half-million-dollar sensor on every bolt to achieve zero unplanned downtime. Thank you from Team Sylas, IIT Kanpur!"*

* **[ACTION: Hold screen on the full Mission Control dashboard at 60 FPS as video fades to black]**

---

## 🎯 Pro Tips for Recording

1. **Use Single-Key Shortcuts:**  
   - Pressing `1` to `7` smoothly switches views without searching for tabs.
   - Pressing `Space` pauses/resumes if you need to hold on a specific waveform.
2. **Smooth Mouse Movements:**  
   - Hover deliberately over tooltips (e.g., thermal expansion badge, SPC control limits, vehicle passport chips).
3. **Audio Delivery:**  
   - Speak with steady confidence and authoritative technical precision. The script is structured so each statement matches the visual action happening right under your cursor!
