# DigitalTwin.ai / Sylas — Final Human Demo Script (Complete Edition)

---

### 0:00–0:30 — Cold Open

**WHAT TO SHOW:**  
Boot/dashboard: 35 stations, stoppage-cost figure, full-sensorization capex and holdout-accuracy figure. Then open Modelling & Physics.

**SAY:**  
Okay, so let me quickly show you what we're actually trying to solve here.

This is a 35-station manufacturing line, and the main problem is that we don't want to put expensive sensors on every single station just to understand what's going on.

At the same time, if a bottleneck starts moving around the line, or a defect starts building up, we need to know about it early.

So the basic idea of our system is: measure what we can, infer what we can't directly measure, and then use all of that information to help the person running the plant make a decision.

So, let's start with the modelling side, because that's where most of the trust in the system comes from.

---

### 0:30–2:00 — Modelling & Physics

**WHAT TO SHOW:**  
Modelling & Physics: topology/35-station split → measured parameters → inferred parameters → four-method fallback ladder. Show S2 (9.8kA, 220ms, 5.08mm), S3 (202.9°C nominal / 233.3°C degraded), S4 cascading thermal expansion badge (`ΔL = 0.751mm → +26.3% TORQUE FRICTION`), S8 and S13. Briefly show cost/accuracy table, especially $385 full retrofit, 0.2 min lead time, 1.6% FAR, 99% trust.

**SAY:**  
Okay, so this is the Modelling & Physics view.

First, we have a 35-station mixed-model line, split into Body, Paint and Final Assembly. Out of these, 24 stations are directly instrumented, while 11 are sensor-poor.

And this table here is basically showing what we actually measure. For example, cycle time is available across all 35 stations, torque on 22, temperature on 28, vibration on 18 critical stations, and throughput across the line.

Now the interesting part is these sensor-poor stations.

For those, we don't just make up a value. We have a few different ways of estimating it.

The first one is the physics-informed model, or PINN. So if we know the physics of a process, we use the governing equation to estimate what should be happening.

If that isn't enough, we can use readings from neighbouring stations. Then we can fall back to historical statistical estimation, and we can also use a Kalman filter when we have a noisy or intermittent reading.

So basically, there's a fallback ladder instead of one black-box model doing everything.

Let me show you one example.

For the spot-welding station S2, we're modelling the weld nugget growth from current, resistance and weld time. With the example parameters here, 9.8 kiloamps and 220 milliseconds gives us around a 5.08 millimetre nugget, which sits in the nominal AWS range.

Then S3 is the thermal example. The model gives us around 202.9 degrees in the nominal case, and when the tooling degrades, that moves up to about 233.3 degrees.

And what's really cool is inter-station physical coupling. If you look right downstream at S4, notice this amber badge: *Delta L = 0.751 millimetres, causing a plus 26.3% torque friction penalty*. That's sensible heat from S3's weld conducting down the chassis fixture, elongating the subframe and binding the fastener threads. So S4's torque alarm isn't a broken tool—it's caused by thermal carryover from S3.

We also have S8 for fastener torque decay and fatigue, and S13 for paint cure kinetics.

So the main idea here is pretty simple: we don't sensorize something just because we can. If we can compute it reliably, we compute it. And if we can't directly measure it, we use a documented inference method.

---

### 2:00–3:30 — Predictive Technology

**WHAT TO SHOW:**  
Predictive Techniques: SPC X-bar/R (show 5 tabs in inspector: Oscilloscope, SPC, FFT Spectrum, 6-Axis Radar, Weibull RUL) → CUSUM → EWMA → PINN robotic dynamics → station defect prediction/S18 → feature importance → 80/20 holdout → Precision 84.2%, Recall 88.9%, FAR 2.6% → confusion matrix. Optionally show model comparison.

**SAY:**  
Now let's move on to the predictive side.

One thing we didn't want to do was say, 'here is our AI model, trust it.'

Instead, we have several techniques looking at the process from different angles.

So, first we have standard SPC with X-bar and R charts. Here we can see the process capability numbers, and in this example the system has flagged an out-of-control condition because one point crossed the three-sigma limit.

And inside the station inspector, we've built five dedicated telemetry views: the live oscilloscope waveform, this Shewhart SPC chart with automated Western Electric rules, a zero-to-500 Hertz FFT harmonic spectrum that isolates bearing fault frequencies, a 6-axis capability radar, and a continuous 2-parameter Weibull RUL curve showing remaining useful life.

Then we have CUSUM and EWMA running alongside it. CUSUM is useful when we want to catch small but persistent shifts, while EWMA gives us a smoother view when the signal is noisy.

Then we have the physics models, like the robotic-arm dynamics here.

And on the machine-learning side, we're predicting things like defect probability station by station.

For example, S18 is showing a very high defect probability, and the system is also giving us a possible cause rather than just giving us a red number.

We can then look at feature importance. Here, process stress and queue contribute 35 percent, equipment degradation and RUL 28 percent, cycle-time deviation 18 percent, environmental factors 11 percent, and operator fatigue 8 percent.

So we can actually get some idea of why the model is making the prediction.

Now, before any of these predictions become an alert, we validate them.

We're using an 80/20 real holdout split, and the confidence threshold can also be adjusted depending on how conservative we want the system to be.

At the current balanced setting, we're getting 84.2 percent precision, 88.9 percent recall and a 2.6 percent false-alarm rate.

And you can see the confusion matrix here as well: 48 true positives, 9 false positives, 6 false negatives and 337 true negatives.

So, basically, no single technique gets to make the decision by itself. They're being used for different types of problems, and then we check how well the predictions actually perform.

---

### 3:30–4:30 — Data Gaps & Causal Inference

**WHAT TO SHOW:**  
Causal Dependency Topology: highlight a sensor-poor/inferred station, upstream blocked → inferred station → downstream starved. Toggle Force-Directed/Arc Diagram. Show causal links, throughput waveform and entropy gauge.

**SAY:**  
Okay, now let's look at the part that I think is one of the more interesting pieces.

What happens when a station doesn't have a sensor?

Let's say we have an unmonitored station in the middle. The station before it starts filling up, so we know there's backpressure upstream. At the same time, the station after it starts getting starved.

If those two things happen together, the station in between becomes a strong candidate for the actual bottleneck.

And the important thing is that this isn't just, 'the AI thinks this station looks suspicious.'

It's based on the flow of the line. If upstream is blocked and downstream is starved, conservation of flow gives us a pretty strong signal about where the constraint is.

You can see that relationship here in the causal topology.

The active bottleneck is connected to the blocked upstream stations and the starved downstream stations.

We also have the throughput waveform and system entropy here, so we can see the effect at the overall-line level.

So this is how we're trying to deal with sensor gaps without simply pretending the missing data doesn't exist.

---

### 4:30–5:30 — Plant Manager View

**WHAT TO SHOW:**  
Plant Manager: Weekly Sensor Coverage & Gap Audit → telemetry heatmap → bottleneck timeline S4 → S11 → S16 → S21 → S26 → S30 → RUL table (S28 2,196h) → live alert strip S13 / 93% trust / action recommended. Show Prescriptive What-If (500-run Monte Carlo distribution) and OT Maintenance Safety Gate.

**SAY:**  
Now let's switch to the Plant Manager view, because this is what someone would actually use day to day.

This isn't really meant to be a firehose of every sensor value.

If I open this on a Monday morning, I want to know what changed over the last shift or the last week.

So here we have coverage across all 35 stations, and I can immediately see which stations are directly measured and which ones are inferred.

Then we have the telemetry heatmap, where I can switch between things like torque, temperature and vibration.

This timeline is also useful because the bottleneck doesn't necessarily stay at one station. Here we can see it moving through the line — S4, then S11, S16, S21, S26 and S30.

And then we have the maintenance table.

For example, S28, the robotic welder, has about 2,196 hours of remaining useful life in this example, and the system is telling us that the urgency is normal.

So instead of waiting for the equipment to fail, someone can actually schedule the maintenance.

And down here, the alert strip gives us the current situation — in this case, a bottleneck detected at S13, with 93 percent system trust and an action recommended.

We also have an interactive What-If simulator: by adjusting line speed and buffer capacity, it executes a 500-iteration stochastic Monte Carlo simulation in real time to calculate line recovery probability and the 80th-percentile recovery horizon.

And if someone attempts to deploy a sensor retrofit on a running line, our OT Safety Gate strictly blocks modification outside designated maintenance windows like shift changeover, protecting live PLC operations.

---

### 5:30–6:15 — Quality / Backward Trace

**WHAT TO SHOW:**  
VIN/Quality panel: select a vehicle, show station history/telemetry/tool wear, run Backward Trace, then show Ranked Recall Set and value-at-risk.

**SAY:**  
Let's also look at what happens when the problem is not just downtime, but quality.

For each vehicle, we can keep a digital history of what happened as it moved through the line.

So if an end-of-line inspection finds a defect, instead of manually checking every station, we can trace the vehicle back through the process.

I'll select a VIN here and then run the backward trace.

The system looks at the vehicle's history, the station information, the tool condition, and the possible blind spots it passed through.

And then we get a ranked set of potentially affected vehicles.

So the idea is that we don't immediately quarantine a huge batch just because one vehicle failed.

We can narrow the investigation down to the units that actually have a connection to the suspected process problem.

That's useful both for quality teams and for the financial side, because it gives us a much better idea of the actual exposure.

---

### 6:15–7:00 — Leadership / ROI

**WHAT TO SHOW:**  
Leadership: pause on $482,628 avoided, $385 capex, 0.0-day payback, 74.3 THI. Show Alpha/Fremont, Beta/Detroit, Gamma/Austin. Then Phase 1 → Phase 2 → Phase 3 ending ~$1.01M/year.

**SAY:**  
Okay, so finally, let's look at the leadership view.

This is where we stop talking about individual stations and look at whether the whole thing actually makes financial sense.

The current dashboard shows $482,628 in total downtime loss avoided.

The low-cost sensor capex is $385 for the 11-node example, and the dashboard shows a Day-1 positive payback.

We can also compare different plants.

Alpha is the 35-station Fremont line, Beta is a 50-station legacy line in Detroit, and Gamma is the 30-station Austin greenfield line.

And then we have the rollout plan.

First, close the remaining gap on Alpha, which is projected at about $26.4k per year in net savings.

Then expand to Detroit and Austin, taking that to about $120k per year.

And at the full enterprise level — 12 plants and 420 stations — the projection is around $1.01 million per year.

So this is basically showing that the same approach isn't limited to one demo line.

---

### 7:00–7:30 — Validation / Close

**WHAT TO SHOW:**  
Validation: show 80/20 holdout and 97.4% ± 1.3% accuracy, 1.3% ± 0.9% FAR. If available, run `python test_runner.py` and finish on `20 / 20 ASSERTIONS PASSED`. Return to dashboard for final frame.

**SAY:**  
Before I wrap up, I just want to show one last thing, which is the validation.

We're not only putting accuracy numbers on the screen. The system is tested on a separate holdout set.

Across the independent runs, we're getting about 97.4 percent average accuracy, with about a 1.3 percent false-alarm rate.

And we also have the automated checks for the different parts of the system—with all 20 out of 20 core engine assertions passing at 100 percent success.

So, overall, the idea is pretty straightforward.

We measure what we can, we infer what we can't, we use physics where physics makes sense, and we use machine learning where it adds value.

And then we keep a human in the loop for the final operational decisions.

That's the DigitalTwin.ai system.

Thank you.
