document.addEventListener('DOMContentLoaded', () => {
  // Global references from other engines
  let sim = window.simEngine;
  const evidenceEngine = window.evidenceEngine;
  const qualityEngine = window.qualityThreadEngine;
  const predictiveEngine = window.predictiveEngine;

  if (!sim || !evidenceEngine || !qualityEngine || !predictiveEngine) {
    console.error('One or more engines failed to load. Check script inclusions in index.html.');
    return;
  }

  // ==========================================
  // 1. State Variables
  // ==========================================
  let selectedStationId = 'S4';

  // ---- Unified station selection — propagates across ALL graphs ----
  function selectStation(stationId, source) {
    if (selectedStationId === stationId && source !== 'init') return;
    selectedStationId = stationId;

    // 1. Highlight in station card strip
    document.querySelectorAll('.station-node').forEach(n => n.classList.remove('selected'));
    const cardNode = document.getElementById(`node-${stationId}`);
    if (cardNode) {
      cardNode.classList.add('selected');
      if (source !== 'card') {
        cardNode.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }

    // 2. Render detail panel & evidence
    const st = sim.stations.find(s => s.id === stationId);
    if (st) {
      renderStationDetailsAndEvidence(st);
      renderMultiCausalDecomposition(st);
    }

    // 3. Heatmap highlight
    document.querySelectorAll('.heatmap-cell').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === stationId);
    });

    // 4. Force redraw of canvas-based graphs (they read selectedStationId)
    // The next animLoop frame will pick up the new selection automatically
  }
  window.selectStation = selectStation;
  let selectedVinId = (sim.vehicles && sim.vehicles.length > 0) ? sim.vehicles[0].vin : 'VIN-2026-8842';
  let lastTimestamp = performance.now();
  let stationNodesCreated = false;
  let sweepLineX = 0;

  // Human-readable labels for raw equipment codes, used anywhere a station's
  // equipment type is shown to a person instead of just logged internally.
  function equipmentLabel(code) {
    const labels = {
      robot_arm: 'Robotic Welder',
      oven: 'Curing Oven',
      press: 'Stamping Press',
      conveyor: 'Conveyor Drive',
      sensor_array: 'Sensor Array'
    };
    return labels[code] || (code ? code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown Equipment');
  }
  let contextMenuStationId = null;
  let animatedValues = {};
  let particles = [];
  let mouseX = 0, mouseY = 0;
  let decisionLoopStep = 0; // 0-5 for OBS, PRD, VER, SIM, DEC, LRN
  let bottleneckHistory = []; // For migration heatmap
  let isSimPaused = false;
  let miniMapStationPoints = []; // screen-space hit targets, rebuilt every draw
  let miniMapHoverId = null;
  let miniMapInteractivityBound = false;

  function initMultiSiteScalability() {
    const select = document.getElementById('select-plant-site');
    if (!select) return;

    const renderSiteDetails = (siteId) => {
      const container = document.getElementById('site-scalability-results');
      if (!container) return;

      const siteData = {
        detroit: {
          name: 'Detroit EV Assembly',
          instrumentation: '60% Baseline Sensors',
          onboardingDays: '14 Days',
          estCost: '$18,500 per line',
          payback: '6.2 Months',
          pinnTransfer: 'High (Standard robot dynamics & thermal models apply)',
          lowCostSensorsNeeded: '8 Retrofit Kits (MEMS + CT Clamps)'
        },
        munich: {
          name: 'Munich Body Shop (Legacy Line)',
          instrumentation: '25% Legacy Sensor Coverage',
          onboardingDays: '21 Days',
          estCost: '$26,000 per line',
          payback: '8.5 Months',
          pinnTransfer: 'Medium (Requires ambient humidity calibration offset)',
          lowCostSensorsNeeded: '22 Retrofit Kits (Full wireless vibration/current mesh)'
        },
        yokohama: {
          name: 'Yokohama Greenfield Powertrain',
          instrumentation: '90% High-Density Smart Sensors',
          onboardingDays: '5 Days (Automated Asset Discovery)',
          estCost: '$6,500 per line',
          payback: '2.8 Months',
          pinnTransfer: 'Very High (Direct digital twin API mapping)',
          lowCostSensorsNeeded: '2 Specialized Acoustic Sensors'
        }
      };

      const data = siteData[siteId] || siteData.detroit;

      container.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
          <div>
            <div style="color:#4FC3F7; font-weight:700; margin-bottom:0.25rem;">${data.name} Extension Profile</div>
            <div>Baseline Coverage: <strong>${data.instrumentation}</strong></div>
            <div>Template Onboarding Time: <strong>${data.onboardingDays}</strong></div>
            <div>Estimated Retrofit Cost: <strong>${data.estCost}</strong></div>
          </div>
          <div>
            <div style="color:#10B981; font-weight:700; margin-bottom:0.25rem;">Scaling Metrics &amp; Transferability</div>
            <div>Projected Site Payback: <strong style="color:#10B981;">${data.payback}</strong></div>
            <div>PINN Model Transferability: <strong>${data.pinnTransfer}</strong></div>
            <div>Hardware Retrofits Required: <strong>${data.lowCostSensorsNeeded}</strong></div>
          </div>
        </div>
      `;
    };

    select.addEventListener('change', (e) => {
      renderSiteDetails(e.target.value);
    });

    renderSiteDetails(select.value);
  }

  // ==========================================
  // 3. Init Functions
  // ==========================================
  function init() {
    initParticleSystem();
    initNavigation();
    initSimulationControls();
    createStationNodeElements();
    initInterventionSimulator();
    initRoiCalculator();
    initMultiSiteScalability();
    initKeyboardShortcuts();
    initContextMenu();
    init3DNodeTilt();
    initFooterTicker();
    initActivityFeed();
    initDecisionLoop();
    initMiniMapInteractivity();
    initViewModeSwitchers();
    initDependencyNetwork();
    
    // Initial UI Setup
    updateShiftDisplay();
    updateEnvironmentDisplay();
    switchTab('supervisor');
    
    // Hide overlay
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 1000);
        showToast('Digital Twin initialized, all 35 stations online', 'success');
      }, 2000);
    }
    
    // Start loop
    requestAnimationFrame(animLoop);
  }

  // ==========================================
  // 4. Main Animation Loop
  // ==========================================
  function animLoop(now) {
    const dt = Math.min(0.1, (now - lastTimestamp) / 1000);
    lastTimestamp = now;

    if (!isSimPaused) {
      const speedSelect = document.getElementById('select-speed');
      const speedFactor = speedSelect ? parseFloat(speedSelect.value) : 1;
      sim.updateContinuous(dt * speedFactor);
    }
    
    // Track bottleneck history for heatmap
    if (!isSimPaused && sim.tickCount % 5 === 0) {
      const activeBtnk = sim.getSummaryMetrics().activeBottleneck;
      bottleneckHistory.push(activeBtnk);
      if (bottleneckHistory.length > 200) bottleneckHistory.shift();
    }

    updateDynamicUI();
    drawParticles();
    drawMiniMap();
    updateDecisionLoop(now);
    updateShiftDisplay();
    updateEnvironmentDisplay();
    drawEntangledState();
    drawThroughputWave();
    drawEntropyGauge();
    drawDependencyNetwork();
    drawInterventionGauges();
    drawInterventionImpact();

    requestAnimationFrame(animLoop);
  }

  // ==========================================
  // 5. Particle System
  // ==========================================
  function initParticleSystem() {
    const canvas = document.getElementById('particle-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });

    const colors = ['rgba(41,182,246,0.15)', 'rgba(0,229,255,0.15)', 'rgba(16,185,129,0.15)', 'rgba(0,184,212,0.15)'];
    
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function drawParticles() {
    const canvas = document.getElementById('particle-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pxMouseX = (mouseX / window.innerWidth - 0.5) * 50;
    const pxMouseY = (mouseY / window.innerHeight - 0.5) * 50;

    particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      const drawX = p.x + pxMouseX * (p.size / 2);
      const drawY = p.y + pxMouseY * (p.size / 2);

      ctx.beginPath();
      ctx.arc(drawX, drawY, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      // Constellation lines
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(drawX, drawY);
          ctx.lineTo(p2.x + pxMouseX * (p2.size / 2), p2.y + pxMouseY * (p2.size / 2));
          ctx.strokeStyle = `rgba(0, 229, 255, ${0.1 * (1 - dist/100)})`;
          ctx.stroke();
        }
      }
    });
  }

  // ==========================================
  // 6. Toast System
  // ==========================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} glass-card fade-in`;
    toast.style.padding = '12px 20px';
    toast.style.marginBottom = '10px';
    toast.style.borderRadius = '8px';
    toast.style.borderLeft = `4px solid ${type === 'success' ? '#10B981' : type === 'warning' ? '#FFAB40' : type === 'error' ? '#EF4444' : '#00E5FF'}`;
    toast.textContent = message;

    container.appendChild(toast);

    while (container.children.length > 3) {
      container.removeChild(container.firstChild);
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4000);
  }

  // ==========================================
  // 7. Navigation
  // ==========================================
  function initNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        addRipple(e, tab);
        switchTab(tab.getAttribute('data-view'));
      });
    });
  }

  function switchTab(targetView) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab-btn[data-view="${targetView}"]`)?.classList.add('active');

    document.querySelectorAll('.view-section').forEach(v => {
      v.style.display = 'none';
      v.classList.remove('fade-in');
    });
    
    const view = document.getElementById(`view-${targetView}`);
    if (view) {
      view.style.display = 'block';
      // Force reflow
      void view.offsetWidth;
      view.classList.add('fade-in');
    }

    // Trigger specific renders
    if (targetView === 'manager') {
      renderManagerView();
      renderHeatmap();
      drawRadarChart();
      drawBottleneckMigration();
      renderMaintenanceTable();
    } else if (targetView === 'leadership') {
      renderLeadershipView();
    } else if (targetView === 'modelling') {
      renderModellingView();
    } else if (targetView === 'predictive') {
      renderPredictiveView();
    }
  }
  window.switchTab = switchTab;

  function addRipple(e, element) {
    const circle = document.createElement('span');
    const diameter = Math.max(element.clientWidth, element.clientHeight);
    const radius = diameter / 2;
    const rect = element.getBoundingClientRect();
    
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - rect.left - radius}px`;
    circle.style.top = `${e.clientY - rect.top - radius}px`;
    circle.classList.add('ripple');
    
    const existing = element.querySelector('.ripple');
    if (existing) existing.remove();
    
    element.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  }

  // ==========================================
  // 8. Station Nodes
  // ==========================================
  function createStationNodeElements() {
    const strip = document.getElementById('stations-strip');
    if (!strip) return;
    strip.innerHTML = '';

    sim.stations.forEach(station => {
      const el = document.createElement('div');
      el.className = 'station-node glass-card';
      el.id = `node-${station.id}`;
      el.dataset.id = station.id;
      
      const zoneColor = station.zone === 'Body' ? '#00E5FF' : station.zone === 'Paint' ? '#29B6F6' : '#10B981';
      const zoneIcon = station.zone === 'Body' ? '🔧' : station.zone === 'Paint' ? '🎨' : '⚙️';
      const sensorCount = Object.values(station.sensors).filter(v => v).length;

      el.innerHTML = `
        <div class="station-node-header">
          <span class="station-id" style="color: ${zoneColor}">${station.id}</span>
          <span class="sensor-pill sensor-${station.sensorCoverage.toLowerCase()}"></span>
        </div>
        <div class="station-zone-tag" style="color:${zoneColor}; opacity:0.6; font-size:0.55rem; letter-spacing:0.5px;">${zoneIcon} ${station.zone}</div>
        <div class="station-metrics">
          <div><span class="metric-label">CYC:</span> <span class="metric-val cyc-val">--</span>s</div>
          <div><span class="metric-label">WIP:</span> <span class="metric-val wip-val">--</span></div>
        </div>
        <div class="buffer-bar-container">
          <div class="buffer-bar-fill"></div>
        </div>
        <div class="station-status-row">
          <span class="equip-status-dot" title="Equipment"></span>
          <span class="station-sensor-count" style="font-size:0.55rem; color:var(--text-muted);">📡${sensorCount}</span>
        </div>
        <div class="station-anomaly-tags"></div>
        <canvas class="sparkline-canvas" width="90" height="28"></canvas>
      `;

      el.addEventListener('click', () => {
        selectStation(station.id, 'card');
      });

      strip.appendChild(el);
    });
    
    // Select default
    const defaultNode = document.getElementById(`node-${selectedStationId}`);
    if (defaultNode) {
      defaultNode.classList.add('selected');
      const st = sim.stations.find(s => s.id === selectedStationId);
      if (st) renderStationDetailsAndEvidence(st);
    }
    
    stationNodesCreated = true;
  }

  // ==========================================
  // 9. Dynamic UI Update
  // ==========================================
  function updateDynamicUI() {
    const metrics = sim.getSummaryMetrics();
    
    // Update header stats
    animateValue('stat-total-wip', metrics.totalWip);
    
    const ab = document.getElementById('stat-active-bottleneck');
    if (ab) {
      if (metrics.activeBottleneck) {
        ab.innerHTML = `<span style="cursor:pointer;" onclick="window.selectStation('${metrics.activeBottleneck}', 'statcard')" title="Active Bottleneck: Station ${metrics.activeBottleneck}">${metrics.activeBottleneck}</span>`;
        ab.className = 'value alert';
      } else {
        ab.textContent = 'None';
        ab.className = 'value success';
      }
    }
    
    // Multiple predicted bottlenecks — always show station name/ID and predicted time (ETA)
    const pb = document.getElementById('stat-predicted-bottleneck');
    if (pb) {
      const preds = metrics.predictedBottlenecks || [];
      if (preds.length === 0) {
        pb.innerHTML = 'None';
        pb.className = 'value success';
      } else if (preds.length === 1) {
        const p = preds[0];
        pb.innerHTML = `
          <div class="predicted-stat-single" onclick="window.selectStation('${p.id}', 'statcard')" title="${p.name || p.id} (${p.type}) — ETA ~${p.eta} min">
            <span class="pred-id">${p.id}</span>
            <span class="pred-time">~${p.eta}m</span>
          </div>
        `;
        pb.className = 'value warn';
      } else {
        const items = preds.slice(0, 3).map(p => `
          <div class="predicted-multi-item" onclick="window.selectStation('${p.id}', 'statcard')" title="${p.name || p.id} (${p.type}) — ETA ~${p.eta} min">
            <span class="pred-id">${p.id}</span>
            <span class="pred-time">~${p.eta}m</span>
          </div>
        `).join('');
        const more = preds.length > 3 ? `<div style="font-size:0.6rem; color:var(--text-muted); text-align:right; margin-top:-2px;">+${preds.length - 3} more</div>` : '';
        pb.innerHTML = `<div class="predicted-multi-value">${items}${more}</div>`;
        pb.className = 'value warn';
      }
    }
    
    animateValue('stat-trust-score', Math.round(metrics.trustScore), val => val + '%');
    animateValue('stat-completed-count', metrics.completedCount);
    animateValue('stat-throughput-rate', Math.round(metrics.throughputRate), val => val + ' JPH');
    animateValue('stat-oee', Math.round(metrics.oee * 100), val => val + '%');

    // Render predicted bottleneck list panel
    renderPredictedBottleneckPanel(metrics.predictedBottlenecks || []);

    // Render bottleneck impact analysis
    renderBottleneckImpactPanel(metrics.bottleneckImpacts);

    // Live Downtime Financial Ticker update — accumulates across the full
    // session so users can see total cost impact, not just per-bottleneck.
    const finCard = document.getElementById('downtime-financial-card');
    const finTicker = document.getElementById('financial-loss-ticker');
    if (finCard && finTicker) {
      // Always show the card so the running total is visible
      finCard.style.display = 'block';
      if (metrics.activeBottleneck && !isSimPaused) {
        const speedSelect = document.getElementById('select-speed');
        const speedFactor = speedSelect ? parseFloat(speedSelect.value) : 1;
        accumulativeFinancialLoss += 4.0 * speedFactor;
        finCard.classList.add('loss-active');
      } else {
        finCard.classList.remove('loss-active');
      }
      finTicker.textContent = `$${Math.round(accumulativeFinancialLoss).toLocaleString()}`;
    }

    // Update nodes
    if (stationNodesCreated) {
      sim.stations.forEach(station => {
        const node = document.getElementById(`node-${station.id}`);
        if (!node) return;

        // Classes
        node.classList.toggle('bottleneck', station.isBottleneck);
        node.classList.toggle('predicted', station.isPredictedBottleneck);
        node.classList.toggle('blocked', station.isBlocked);
        node.classList.toggle('starved', station.isStarved);

        // Metrics
        node.querySelector('.cyc-val').textContent = station.actualCycle.toFixed(1);
        node.querySelector('.wip-val').textContent = station.wipCount;
        
        // Buffer bar
        const bufferPct = (station.wipCount / station.maxBuffer) * 100;
        const barFill = node.querySelector('.buffer-bar-fill');
        barFill.style.width = `${Math.min(100, bufferPct)}%`;
        barFill.style.backgroundColor = bufferPct > 80 ? '#EF4444' : bufferPct > 50 ? '#FFAB40' : '#10B981';

        // Equipment status dot
        const equipDot = node.querySelector('.equip-status-dot');
        if (equipDot) {
          const statusColors = { ok: '#10B981', degraded: '#FFAB40', critical: '#EF4444' };
          equipDot.style.backgroundColor = statusColors[station.equipmentStatus] || '#10B981';
          equipDot.title = `Equipment: ${station.equipmentStatus}`;
        }

        // Anomaly tags
        const anomalyContainer = node.querySelector('.station-anomaly-tags');
        if (anomalyContainer) {
          if (station.anomalyFlags.length > 0) {
            anomalyContainer.innerHTML = station.anomalyFlags.slice(0, 2).map(f => 
              `<span class="anomaly-micro-tag">${f}</span>`
            ).join('');
          } else if (station.isBlocked) {
            anomalyContainer.innerHTML = '<span class="anomaly-micro-tag blocked-tag">BLOCKED</span>';
          } else if (station.isStarved) {
            anomalyContainer.innerHTML = '<span class="anomaly-micro-tag starved-tag">STARVED</span>';
          } else {
            anomalyContainer.innerHTML = '';
          }
        }

        // Sparkline
        drawSparkline(node.querySelector('.sparkline-canvas'), sim.telemetryHistory[station.id]?.cycleTimeHistory || []);
      });
    }

    const st = sim.stations.find(s => s.id === selectedStationId);
    if (st) {
      renderMultiCausalDecomposition(st);
    }
    
    drawTelemetryOscilloscope();
    drawConveyorFlowCanvas();
    renderVehicleThread();
    renderRecallSetPanel();
  }

  // ==========================================
  // 9b. Predicted Bottleneck List Panel
  // ==========================================
  function renderPredictedBottleneckPanel(predictions) {
    let container = document.getElementById('predicted-bottleneck-panel');
    if (!container) {
      // Create the panel dynamically next to the multicausal container
      const analyzerCard = document.querySelector('.analyzer-card');
      if (!analyzerCard) return;
      container = document.createElement('div');
      container.id = 'predicted-bottleneck-panel';
      container.style.cssText = 'margin-top:0.75rem;';
      // Insert after the h3 but before the matrix container
      const matrixContainer = document.getElementById('multicausal-matrix-container');
      if (matrixContainer) {
        analyzerCard.insertBefore(container, matrixContainer);
      } else {
        analyzerCard.appendChild(container);
      }
    }

    if (!predictions || predictions.length === 0) {
      container.innerHTML = `<div style="font-size:0.75rem; color:#4FC3F7; padding:0.4rem 0;">
        <span style="opacity:0.6">🔮 Predicted Bottlenecks:</span> <span style="color:#10B981;">None — line healthy</span>
      </div>`;
      return;
    }

    const items = predictions.slice(0, 5).map(p => {
      const sevColor = p.ratio > 70 ? '#EF4444' : p.ratio > 50 ? '#FFAB40' : '#4FC3F7';
      return `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0.5rem; background:rgba(255,255,255,0.03); border-radius:6px; margin-bottom:0.25rem; border-left:3px solid ${sevColor}; cursor:pointer; transition:background 0.15s ease;" onclick="window.selectStation('${p.id}', 'predpanel')" title="${p.name || p.id} (${p.type}) — Click to inspect">
        <span style="font-weight:700; color:${sevColor}; min-width:28px;">${p.id}</span>
        <span style="flex:1; font-size:0.7rem; color:#ccc;">${p.type}</span>
        <span style="font-size:0.65rem; color:#FFAB40; white-space:nowrap;">~${p.eta} min</span>
        <span style="font-size:0.65rem; color:${sevColor}; min-width:32px; text-align:right;">${p.ratio}%</span>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div style="font-size:0.75rem; color:#4FC3F7; margin-bottom:0.35rem;">
        🔮 Predicted Bottlenecks <span style="opacity:0.6">(${predictions.length})</span>
      </div>
      ${items}
    `;
  }

  // ==========================================
  // 9c. Bottleneck Impact Panel
  // ==========================================
  function renderBottleneckImpactPanel(impactData) {
    let container = document.getElementById('bottleneck-impact-panel');
    if (!container) {
      const analyzerCard = document.querySelector('.analyzer-card');
      if (!analyzerCard) return;
      container = document.createElement('div');
      container.id = 'bottleneck-impact-panel';
      container.style.cssText = 'margin-top:0.5rem;';
      const interventionPanel = analyzerCard.querySelector('.intervention-panel');
      if (interventionPanel) {
        analyzerCard.insertBefore(container, interventionPanel);
      } else {
        analyzerCard.appendChild(container);
      }
    }

    if (!impactData || impactData.impacts.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    const impactItems = impactData.impacts.map(imp => {
      const color = imp.severity === 'critical' ? '#EF4444' : '#FFAB40';
      return `<div style="display:flex; align-items:flex-start; gap:0.5rem; padding:0.35rem 0.5rem; background:rgba(239,68,68,0.06); border-radius:6px; margin-bottom:0.2rem; border-left:3px solid ${color};">
        <span style="font-size:0.85rem; flex-shrink:0;">${imp.icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.7rem; font-weight:600; color:${color};">${imp.type}</div>
          <div style="font-size:0.65rem; color:#aaa; line-height:1.3;">${imp.description}</div>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = `
      <div style="font-size:0.75rem; color:#EF4444; font-weight:600; margin-bottom:0.35rem;">
        💥 Bottleneck Ripple — ${impactData.stationId} (${impactData.zone})
        <span style="font-size:0.65rem; font-weight:400; color:#aaa; margin-left:0.5rem;">${impactData.totalAffectedStations} stations affected</span>
      </div>
      ${impactItems}
    `;
  }

  function drawSparkline(canvas, data) {
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...data) * 0.9;
    const max = Math.max(...data) * 1.1;
    const range = max - min || 1;

    ctx.beginPath();
    ctx.strokeStyle = '#29B6F6';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((data[i] - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ==========================================
  // 10. Animated Number Counters
  // ==========================================
  function animateValue(elemId, targetVal, formatter = (v) => v) {
    const elem = document.getElementById(elemId);
    if (!elem) return;
    
    if (animatedValues[elemId] === undefined) {
      animatedValues[elemId] = targetVal;
    }
    
    const curr = animatedValues[elemId];
    const diff = targetVal - curr;
    
    // Smooth lerp
    if (Math.abs(diff) > 0.1) {
      animatedValues[elemId] = curr + diff * 0.1;
    } else {
      animatedValues[elemId] = targetVal;
    }
    
    elem.textContent = formatter(Math.round(animatedValues[elemId]));
  }

  // ==========================================
  // 11. Station Inspector + Evidence
  // ==========================================
  function renderStationDetailsAndEvidence(station) {
    document.getElementById('selected-station-title').textContent = `${station.id} - ${station.name}`;
    document.getElementById('selected-station-equipment').textContent = equipmentLabel(station.equipment);

    const evidence = evidenceEngine.calculateStationEvidence(station);
    
    // ---- Zone-Specific Engineering Specs ----
    const zoneSpecs = {
      Body: {
        cycleNom: 58, cycleMin: 48, cycleMax: 68, cycleUnit: 's',
        torqueNom: 42, torqueMin: 38, torqueMax: 46, torqueUnit: 'Nm',
        tempNom: 40, tempMin: 35, tempMax: 45, tempUnit: '°C',
        vibNom: 0.05, vibMin: 0.01, vibMax: 0.12, vibUnit: 'g (RMS)',
        tempLabel: 'Weld Zone Surface Temp', torqueLabel: 'Servo Motor Torque',
        vibLabel: 'Structural Vibration (ISO 10816)',
        degradation: 'Electrode tip wear → weld nugget diameter shrinkage → increased spatter',
        failureMode: 'Insufficient nugget penetration (cold weld) or expulsion (excess current)',
        cpkTarget: 1.33
      },
      Paint: {
        cycleNom: 65, cycleMin: 55, cycleMax: 75, cycleUnit: 's',
        torqueNom: 12, torqueMin: 8, torqueMax: 16, torqueUnit: 'Nm',
        tempNom: 180, tempMin: 175, tempMax: 185, tempUnit: '°C',
        vibNom: 0.02, vibMin: 0.005, vibMax: 0.08, vibUnit: 'g (RMS)',
        tempLabel: 'Curing Oven Zone Temp', torqueLabel: 'Pump / Atomizer Load',
        vibLabel: 'Booth HVAC Vibration',
        degradation: 'Nozzle clogging → uneven film build → orange peel / sag defects',
        failureMode: 'Under-cure (oven cold spot) or over-bake (yellowing / brittleness)',
        cpkTarget: 1.67
      },
      Assembly: {
        cycleNom: 62, cycleMin: 52, cycleMax: 72, cycleUnit: 's',
        torqueNom: 48, torqueMin: 42, torqueMax: 54, torqueUnit: 'Nm',
        tempNom: 38, tempMin: 30, tempMax: 50, tempUnit: '°C',
        vibNom: 0.08, vibMin: 0.02, vibMax: 0.15, vibUnit: 'g (RMS)',
        tempLabel: 'Fastener / Motor Temp', torqueLabel: 'DC Tool Clamp Torque',
        vibLabel: 'Rundown Vibration Signature',
        degradation: 'Bit wear → angle overshoot → prevailing torque drift → joint relaxation',
        failureMode: 'Under-torque (loose joint rattle) or cross-threading (strip / gall)',
        cpkTarget: 1.33
      }
    };
    const spec = zoneSpecs[station.zone] || zoneSpecs.Assembly;

    // ---- Live values ----
    const hist = sim.telemetryHistory[station.id];
    const liveTorque = hist && hist.torqueHistory.length > 0 ? hist.torqueHistory[hist.torqueHistory.length - 1] : spec.torqueNom;
    const liveTemp = spec.tempNom + ((station.actualCycle % 5) - 2.5);
    const liveVib = spec.vibNom + (Math.sin(sim.tickCount * 0.1 + station.index) * spec.vibNom * 0.4);

    // ---- Sensor availability ----
    const hasTorque = station.sensors?.torqueSensor || station.sensors?.currentClamp;
    const hasTemp = station.sensors?.thermocouple || station.sensors?.irCamera;
    const hasVib = station.sensors?.accelerometer;
    const hasCycle = station.sensors?.opticalProximity;

    // ---- Cpk simulation ----
    const calcCpk = (live, nom, min, max) => {
      const sigma = Math.abs(live - nom) * 0.8 + 0.1;
      const cpu = (max - live) / (3 * sigma);
      const cpl = (live - min) / (3 * sigma);
      return Math.min(cpu, cpl);
    };

    const torqueCpk = calcCpk(liveTorque, spec.torqueNom, spec.torqueMin, spec.torqueMax);
    const tempCpk = calcCpk(liveTemp, spec.tempNom, spec.tempMin, spec.tempMax);

    // ---- Drift rate ----
    const torqueDrift = ((liveTorque - spec.torqueNom) / spec.torqueNom * 100).toFixed(2);
    const tempDrift = ((liveTemp - spec.tempNom) / spec.tempNom * 100).toFixed(2);

    // ---- Status helpers ----
    const inSpec = (v, lo, hi) => v >= lo && v <= hi;
    const statusBadge = (hasSensor, live, lo, hi, inferLabel) => {
      if (!hasSensor) return `<span style="color:#2979FF; font-weight:700; font-size:0.65rem;">⛔ NO SENSOR</span>`;
      if (inSpec(live, lo, hi)) return `<span style="color:#10B981; font-weight:700; font-size:0.65rem;">✓ IN SPEC</span>`;
      return `<span style="color:#EF4444; font-weight:700; font-size:0.65rem;">⚠ DRIFTING</span>`;
    };
    const cpkBadge = (cpk, target) => {
      const color = cpk >= target ? '#10B981' : cpk >= 1.0 ? '#FFAB40' : '#EF4444';
      return `<span style="color:${color}; font-size:0.65rem;">Cpk ${cpk.toFixed(2)}</span>`;
    };

    const statsContainer = document.getElementById('telemetry-stats');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div style="grid-column: span 2; margin-bottom: 0.25rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.4rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:#4FC3F7; font-size:0.8rem;">Station Parameter Matrix</span>
            <span style="font-size:0.65rem; color:var(--text-muted);">Zone: ${station.zone} | Cpk Target ≥ ${spec.cpkTarget}</span>
          </div>
        </div>

        <!-- Cycle Time -->
        <div style="background:rgba(255,255,255,0.03); padding:0.4rem 0.5rem; border-radius:6px; border-left:2px solid ${hasCycle ? '#10B981' : '#FFAB40'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#aaa; font-size:0.7rem;">⏱ Cycle Time</span>
            ${hasCycle ? '<span style="color:#10B981; font-weight:600; font-size:0.6rem;">MES TIMER</span>' : '<span style="color:#FFAB40; font-weight:600; font-size:0.6rem;">INFERRED</span>'}
          </div>
          <div style="font-size:0.85rem; font-weight:800; color:#fff;">${station.actualCycle.toFixed(1)}${spec.cycleUnit}</div>
          <div style="font-size:0.6rem; color:var(--text-muted);">
            Target: ${spec.cycleNom}${spec.cycleUnit} | Range: ${spec.cycleMin}–${spec.cycleMax}${spec.cycleUnit} | Takt: 60s
          </div>
        </div>

        <!-- Temperature -->
        <div style="background:rgba(255,255,255,0.03); padding:0.4rem 0.5rem; border-radius:6px; border-left:2px solid ${hasTemp ? (inSpec(liveTemp, spec.tempMin, spec.tempMax) ? '#10B981' : '#EF4444') : '#2979FF'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#aaa; font-size:0.7rem;">🌡 ${spec.tempLabel}</span>
            ${statusBadge(hasTemp, liveTemp, spec.tempMin, spec.tempMax)}
          </div>
          <div style="font-size:0.85rem; font-weight:800; color:#fff;">
            ${hasTemp ? `${liveTemp.toFixed(1)}${spec.tempUnit}` : '<span style="color:#2979FF;">[PINN ESTIMATE]</span>'}
          </div>
          <div style="font-size:0.6rem; color:var(--text-muted);">
            Target: ${spec.tempNom}${spec.tempUnit} | Range: ${spec.tempMin}–${spec.tempMax}${spec.tempUnit} | ${hasTemp ? `${cpkBadge(tempCpk, spec.cpkTarget)} | Drift: ${tempDrift}%` : 'Confidence: ~72% (physics model)'}
          </div>
        </div>

        <!-- Torque -->
        <div style="background:rgba(255,255,255,0.03); padding:0.4rem 0.5rem; border-radius:6px; border-left:2px solid ${hasTorque ? (inSpec(liveTorque, spec.torqueMin, spec.torqueMax) ? '#10B981' : '#EF4444') : '#2979FF'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#aaa; font-size:0.7rem;">🔧 ${spec.torqueLabel}</span>
            ${statusBadge(hasTorque, liveTorque, spec.torqueMin, spec.torqueMax)}
          </div>
          <div style="font-size:0.85rem; font-weight:800; color:#fff;">
            ${hasTorque ? `${liveTorque.toFixed(1)} ${spec.torqueUnit}` : '<span style="color:#2979FF;">[NEIGHBOR INTERP.]</span>'}
          </div>
          <div style="font-size:0.6rem; color:var(--text-muted);">
            Target: ${spec.torqueNom} ${spec.torqueUnit} | Range: ${spec.torqueMin}–${spec.torqueMax} ${spec.torqueUnit} | ${hasTorque ? `${cpkBadge(torqueCpk, spec.cpkTarget)} | Drift: ${torqueDrift}%` : 'Confidence: ~65% (spatial avg)'}
          </div>
        </div>

        <!-- Vibration -->
        <div style="background:rgba(255,255,255,0.03); padding:0.4rem 0.5rem; border-radius:6px; border-left:2px solid ${hasVib ? '#10B981' : '#2979FF'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#aaa; font-size:0.7rem;">📳 ${spec.vibLabel}</span>
            ${statusBadge(hasVib, liveVib, spec.vibMin, spec.vibMax)}
          </div>
          <div style="font-size:0.85rem; font-weight:800; color:#fff;">
            ${hasVib ? `${liveVib.toFixed(3)} ${spec.vibUnit}` : '<span style="color:#2979FF;">[MANUAL CHECK]</span>'}
          </div>
          <div style="font-size:0.6rem; color:var(--text-muted);">
            Target: ${spec.vibNom} ${spec.vibUnit} | Range: ${spec.vibMin}–${spec.vibMax} | ${hasVib ? 'ISO 10816 Class I' : 'No accelerometer installed'}
          </div>
        </div>

        <!-- Degradation & Failure Mode Context -->
        <div style="grid-column: span 2; margin-top: 0.25rem; padding: 0.4rem 0.5rem; background: rgba(239,68,68,0.05); border-radius: 6px; border-left: 2px solid rgba(239,68,68,0.3); font-size: 0.6rem; color: var(--text-muted);">
          <div><strong style="color:#EF4444;">Degradation Path:</strong> ${spec.degradation}</div>
          <div style="margin-top:0.15rem;"><strong style="color:#FFAB40;">Primary Failure Mode:</strong> ${spec.failureMode}</div>
        </div>

        <!-- Factory Physics: Active Utilization & TOC Step -->
        <div style="grid-column: span 2; margin-top: 0.25rem; padding: 0.4rem 0.5rem; background: rgba(0,229,255,0.04); border-radius: 6px; border-left: 2px solid rgba(0,229,255,0.3); font-size: 0.65rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
            <span style="color:#4FC3F7; font-weight:700;">🏭 Factory Physics</span>
            <span style="font-size:0.6rem; color:var(--text-muted);">Active Period Method</span>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <div style="flex:1; min-width:80px; background:rgba(255,255,255,0.03); padding:0.3rem; border-radius:4px; text-align:center;">
              <div style="color:var(--text-muted); font-size:0.55rem;">STATE</div>
              <div style="font-weight:800; color:${station._state === 'working' ? '#10B981' : station._state === 'blocked' ? '#EF4444' : '#FFAB40'};">
                ${(station._state || 'working').toUpperCase()}
              </div>
            </div>
            <div style="flex:1; min-width:80px; background:rgba(255,255,255,0.03); padding:0.3rem; border-radius:4px; text-align:center;">
              <div style="color:var(--text-muted); font-size:0.55rem;">ACTIVE UTIL</div>
              <div style="font-weight:800; color:${(station.activeUtilization || 0) > 0.85 ? '#EF4444' : (station.activeUtilization || 0) > 0.6 ? '#FFAB40' : '#10B981'};">
                ${((station.activeUtilization || 0) * 100).toFixed(0)}%
              </div>
            </div>
            <div style="flex:1; min-width:80px; background:rgba(255,255,255,0.03); padding:0.3rem; border-radius:4px; text-align:center;">
              <div style="color:var(--text-muted); font-size:0.55rem;">BTNK SCORE</div>
              <div style="font-weight:800; color:${(station.bottleneckScore || 0) > 0.35 ? '#EF4444' : '#10B981'};">
                ${(station.bottleneckScore || 0).toFixed(2)}
              </div>
            </div>
            <div style="flex:1; min-width:80px; background:rgba(255,255,255,0.03); padding:0.3rem; border-radius:4px; text-align:center;">
              <div style="color:var(--text-muted); font-size:0.55rem;">TOC STEP</div>
              <div style="font-weight:800; color:${station.tocStep === 'IDENTIFY' ? '#EF4444' : station.tocStep === 'SUBORDINATE' ? '#FFAB40' : station.tocStep === 'EXPLOIT' ? '#FF6D00' : '#10B981'};">
                ${station.tocStep || 'OK'}
              </div>
            </div>
          </div>
          <div style="margin-top:0.25rem; font-size:0.55rem; color:var(--text-muted);">
            📋 ${station.tocAction || 'Normal operation.'}
            ${station._neighborInferredConstraint ? '<br><span style="color:#FF6D00; font-weight:700;">⚠ NEIGHBOR-INFERRED CONSTRAINT: upstream blocked + downstream starved → likely hidden bottleneck</span>' : ''}
          </div>
        </div>
      `;
    }

    // ---- Compact Confidence Dial (70px inline) ----
    const dialContainer = document.getElementById('evidence-dial-container');
    if (dialContainer) {
      dialContainer.innerHTML = evidenceEngine.generateDialSVG(evidence.confidenceScore, evidence.breakdown);
    }
    
    const breakdownList = document.getElementById('trust-breakdown-list');
    if (breakdownList) {
      breakdownList.innerHTML = '';
      for (const [key, val] of Object.entries(evidence.breakdown)) {
        if (val > 0) {
          const colors = { Observed: '#10B981', Inferred: '#00E5FF', Stale: '#FFAB40', Conflicting: '#EF4444', Unknown: '#6B7280' };
          breakdownList.innerHTML += `<div style="display:flex; justify-content:space-between;"><span style="color:${colors[key] || '#888'};">● ${key}</span><span style="color:#fff; font-weight:600;">${val}%</span></div>`;
        }
      }
    }

    drawStationInspectorGraph(station);

    const actionRec = document.getElementById('station-evidence-rec');
    if (actionRec) actionRec.textContent = evidence.actionRecommendation;

    const retrofitContainer = document.getElementById('retrofit-action-container');
    if (retrofitContainer) {
      if (station.sensorCoverage === 'UNKNOWN' || station.sensorCoverage === 'STALE') {
        retrofitContainer.style.display = 'block';
        retrofitContainer.innerHTML = `<button class="btn btn-primary btn-sm" onclick="window.simEngine.upgradeStationCoverage('${station.id}')">Deploy IoT Sensor Retrofit</button>`;
      } else {
        retrofitContainer.style.display = 'none';
      }
    }

    const pinnBox = document.getElementById('pinn-model-box');
    if (pinnBox && evidence.pinnDetail) {
      pinnBox.style.display = 'block';
      const isLiveSolve = ['S2', 'S3', 'S8', 'S13'].includes(station.id);
      const livePinn = window.evidenceEngine?.computePinnLive(station.id, station);
      const rawR2 = (livePinn && typeof livePinn.runningR2 === 'string') ? parseFloat(livePinn.runningR2) : (station.physicsStats?.runningR2 ?? 0.93);
      const earnedR2Label = rawR2 < 0.5 
        ? `${rawR2.toFixed(2)} (⚠️ Low Calibration Fit)` 
        : `${rawR2.toFixed(2)}`;
      
      pinnBox.innerHTML = `
        <div style="font-family: var(--font-mono); font-size: 10px; color: #29B6F6; padding: 0.5rem; background: rgba(6,182,212,0.05); border-radius: 6px; margin-top: 0.5rem; border: 1px solid ${isLiveSolve ? 'rgba(16,185,129,0.3)' : 'rgba(0,229,255,0.2)'};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
            <span style="color:#888;">// Physics-Informed Model</span>
            <span style="font-size:0.6rem; padding:1px 5px; border-radius:3px; font-weight:700; ${isLiveSolve ? 'background:rgba(16,185,129,0.2); color:#10B981;' : 'background:rgba(0,229,255,0.15); color:#00E5FF;'}">
              ${isLiveSolve ? '⚡ LIVE PINN / PHYSICS SOLVER' : '📐 CALIBRATED RESIDUAL BOUND'}
            </span>
          </div>
          <div><strong>${evidence.pinnDetail.name}</strong> <span style="color:${rawR2 >= 0.7 ? '#10B981' : '#FFAB40'}; font-weight:700;">(Live Earned R² = ${earnedR2Label})</span></div>
          <div style="color:#4FC3F7; margin-top:0.15rem;">${evidence.pinnDetail.equation}</div>
          <div style="color:#888; margin-top:0.15rem;">Inputs: ${evidence.pinnDetail.inputs.join(' · ')}</div>
          ${livePinn ? `
            <div style="margin-top:0.35rem; padding-top:0.35rem; border-top:1px dashed rgba(16,185,129,0.3); color:#10B981;">
              <strong>Live Telemetry Output:</strong> ${livePinn.outputName} = <strong>${livePinn.value}</strong> <span style="color:#aaa; font-size:0.6rem;">(Residual: ${livePinn.physicsResidual})</span>
            </div>
          ` : `
            <div style="margin-top:0.25rem; font-size:0.6rem; color:#aaa; font-style:italic;">
              Physics residual bound used for spatial interpolation (not live-solved).
            </div>
          `}
        </div>
      `;
    } else if (pinnBox) {
      pinnBox.style.display = 'none';
    }
  }

  // ==========================================
  // 12. Multi-Causal Decomposition (Layer 2)
  // ==========================================
  function renderMultiCausalDecomposition(station) {
    const mc = sim.getMultiCausalBreakdown(station.id);
    const container = document.getElementById('multicausal-matrix-container');
    if (!container || !mc) return;

    const stressPct = Math.round((station.stressScore || 0) * 100);
    const defectProbPct = Math.round((station.defectProbability || 0) * 100);
    const stressColor = stressPct > 70 ? '#EF4444' : stressPct > 40 ? '#FFAB40' : '#10B981';

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; padding-bottom:0.3rem; border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-weight:700; color:#4FC3F7; font-size:0.78rem;">Layer 2 — Multi-Causal Defect Drivers</span>
        <span style="font-size:0.65rem; color:${stressColor}; font-weight:700;">Stress: ${stressPct}% | P(Defect): ${defectProbPct}%</span>
      </div>
      <div class="mc-bar"><div class="mc-label">Equipment Wear</div><div class="mc-track"><div class="mc-fill bg-rose" style="width:${mc.equipmentWearPct}%"></div></div><span>${mc.equipmentWearPct.toFixed(0)}%</span></div>
      <div class="mc-bar"><div class="mc-label">Operator Variation</div><div class="mc-track"><div class="mc-fill bg-cyan" style="width:${mc.operatorVarPct}%"></div></div><span>${mc.operatorVarPct.toFixed(0)}%</span></div>
      <div class="mc-bar"><div class="mc-label">Part Quality</div><div class="mc-track"><div class="mc-fill bg-amber" style="width:${mc.partQualityPct}%"></div></div><span>${mc.partQualityPct.toFixed(0)}%</span></div>
      <div class="mc-bar"><div class="mc-label">Environmental</div><div class="mc-track"><div class="mc-fill bg-emerald" style="width:${mc.environmentPct}%"></div></div><span>${mc.environmentPct.toFixed(0)}%</span></div>
      <div style="display:flex; justify-content:space-between; font-size: 11px; margin-top: 5px;">
        <span style="color: #4FC3F7;">Dominant: <strong>${mc.primaryDriver}</strong></span>
        <span style="color: ${station.defectsInjected > 0 ? '#EF4444' : '#10B981'}; font-weight:600;">Defects: ${station.defectsInjected || 0}</span>
      </div>
    `;
  }

  // ==========================================
  // 13. Telemetry Oscilloscope
  // ==========================================
  function drawTelemetryOscilloscope() {
    const canvas = document.getElementById('canvas-telemetry');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 120; // fixed height

    ctx.clearRect(0, 0, w, h);
    
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const station = sim.stations.find(s => s.id === selectedStationId);
    if (!station) return;

    const hist = sim.telemetryHistory[station.id];
    if (!hist || hist.torqueHistory.length === 0) {
      // No samples yet for a just-selected station: show a live "acquiring signal"
      // state instead of leaving the chart looking like dead, empty space.
      const pulse = 0.35 + Math.sin(performance.now() / 300) * 0.15;
      ctx.strokeStyle = `rgba(41, 182, 246, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, h/2);
      ctx.lineTo(w, h/2);
      ctx.stroke();
      ctx.setLineDash([]);

      sweepLineX = (sweepLineX + 3) % w;
      const scanGrad = ctx.createLinearGradient(sweepLineX - 20, 0, sweepLineX + 20, 0);
      scanGrad.addColorStop(0, 'rgba(0, 229, 255, 0)');
      scanGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.35)');
      scanGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(sweepLineX - 20, 0, 40, h);

      ctx.fillStyle = 'rgba(224, 224, 224, 0.6)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Acquiring telemetry\u2026', w / 2, h / 2 - 12);
      return;
    }

    const data = hist.torqueHistory;
    const ucl = hist.uclTorque;
    const lcl = hist.lclTorque;
    const min = Math.min(...data, lcl) * 0.9;
    const max = Math.max(...data, ucl) * 1.1;
    const range = max - min || 1;

    const getX = i => (i / (data.length - 1)) * w;
    const getY = val => h - ((val - min) / range) * h;

    // UCL / LCL
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, getY(ucl)); ctx.lineTo(w, getY(ucl));
    ctx.moveTo(0, getY(lcl)); ctx.lineTo(w, getY(lcl));
    ctx.stroke();
    ctx.setLineDash([]);

    // Main signal
    ctx.strokeStyle = station.spcState.trend !== 'stable' ? '#EF4444' : '#29B6F6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      if (i === 0) ctx.moveTo(getX(i), getY(data[i]));
      else ctx.lineTo(getX(i), getY(data[i]));
    }
    ctx.stroke();
    
    // Glow dot
    const lastY = getY(data[data.length - 1]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(w, lastY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Sweep line
    sweepLineX = (sweepLineX + 2) % w;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.fillRect(sweepLineX, 0, 2, h);
  }

  // View Modes & Telemetry Tabs State
  let currentConveyorViewMode = '2D'; // '2D', '3D', 'ENERGY'
  let currentTelemetryTab = 'OSC'; // 'OSC', 'SPC', 'FFT'
  let accumulativeFinancialLoss = 0;

  function initViewModeSwitchers() {
    const btn2d = document.getElementById('btn-mode-2d');
    const btn3d = document.getElementById('btn-mode-3d');
    const btnEnergy = document.getElementById('btn-mode-energy');
    const badge = document.getElementById('line-mode-badge');

    const setMode = (mode, label) => {
      currentConveyorViewMode = mode;
      [btn2d, btn3d, btnEnergy].forEach(b => b?.classList.remove('active'));
      if (mode === '2D') btn2d?.classList.add('active');
      else if (mode === '3D') btn3d?.classList.add('active');
      else if (mode === 'ENERGY') btnEnergy?.classList.add('active');
      if (badge) badge.textContent = label;
      drawConveyorFlowCanvas();
    };

    btn2d?.addEventListener('click', () => setMode('2D', '1-to-1 Aligned Track'));
    btn3d?.addEventListener('click', () => setMode('3D', '3D Isometric Factory Grid'));
    btnEnergy?.addEventListener('click', () => setMode('ENERGY', 'Energy & Thermal Matrix'));

    const tabOsc = document.getElementById('tab-tel-osc');
    const tabSpc = document.getElementById('tab-tel-spc');
    const tabFft = document.getElementById('tab-tel-fft');

    const setTelTab = (tab) => {
      currentTelemetryTab = tab;
      [tabOsc, tabSpc, tabFft].forEach(t => t?.classList.remove('active'));
      if (tab === 'OSC') tabOsc?.classList.add('active');
      else if (tab === 'SPC') tabSpc?.classList.add('active');
      else if (tab === 'FFT') tabFft?.classList.add('active');
      const st = sim.stations.find(s => s.id === selectedStationId);
      if (st) drawStationInspectorGraph(st);
    };

    tabOsc?.addEventListener('click', () => setTelTab('OSC'));
    tabSpc?.addEventListener('click', () => setTelTab('SPC'));
    tabFft?.addEventListener('click', () => setTelTab('FFT'));
  }

  // Dispatcher for station inspector graph based on selected tab
  function drawStationInspectorGraph(station) {
    if (!station) return;
    if (currentTelemetryTab === 'SPC') {
      drawTelemetrySPC(station);
    } else if (currentTelemetryTab === 'FFT') {
      drawTelemetryFFT(station);
    } else {
      drawTelemetryOscilloscope();
    }
  }

  // SPC Shewhart Control Chart
  function drawTelemetrySPC(station) {
    const canvas = document.getElementById('canvas-telemetry');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 130;

    ctx.clearRect(0, 0, w, h);

    const hist = sim.telemetryHistory[station.id]?.torqueHistory || [];
    const mean = 120;
    const ucl = 130;
    const lcl = 110;

    // Background grid & limits
    const getY = (val) => h - 15 - ((val - 100) / 40) * (h - 30);

    // LCL / UCL / Mean lines
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    // UCL
    ctx.beginPath(); ctx.moveTo(35, getY(ucl)); ctx.lineTo(w - 10, getY(ucl)); ctx.stroke();
    // LCL
    ctx.beginPath(); ctx.moveTo(35, getY(lcl)); ctx.lineTo(w - 10, getY(lcl)); ctx.stroke();
    
    // Mean
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
    ctx.beginPath(); ctx.moveTo(35, getY(mean)); ctx.lineTo(w - 10, getY(mean)); ctx.stroke();
    ctx.setLineDash([]);

    // Limit labels
    ctx.fillStyle = '#EF4444';
    ctx.font = '600 8px Inter';
    ctx.fillText('UCL 130', 2, getY(ucl) + 3);
    ctx.fillText('LCL 110', 2, getY(lcl) + 3);
    ctx.fillStyle = '#10B981';
    ctx.fillText('x̄ 120', 2, getY(mean) + 3);

    // Plot points
    if (hist.length > 1) {
      const step = (w - 45) / Math.max(1, hist.length - 1);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      hist.forEach((val, i) => {
        const x = 35 + i * step;
        const y = getY(val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Out of control dots
      hist.forEach((val, i) => {
        const x = 35 + i * step;
        const y = getY(val);
        if (val > ucl || val < lcl) {
          ctx.fillStyle = '#EF4444';
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
      });
    }

    // Cpk badge inside graph
    ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
    ctx.beginPath(); ctx.roundRect(w - 110, 8, 100, 20, 4); ctx.fill();
    ctx.fillStyle = '#00E5FF';
    ctx.font = '700 9px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(`Cpk: ${station.spcState.cpk.toFixed(2)} | Ppk: ${station.spcState.ppk.toFixed(2)}`, w - 60, 21);
  }

  // FFT Frequency Spectrum
  function drawTelemetryFFT(station) {
    const canvas = document.getElementById('canvas-telemetry');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 130;

    ctx.clearRect(0, 0, w, h);

    // Baseline frequency spectrum bars (0-500 Hz)
    const frequencies = [30, 60, 120, 180, 240, 300, 360, 420, 480];
    const isFault = station.anomalyFlags.length > 0 || station.isBottleneck;
    const time = performance.now() / 1000;

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(30, 15, w - 40, h - 35);

    // Draw harmonic bars
    frequencies.forEach((freq, idx) => {
      const x = 35 + (idx / (frequencies.length - 1)) * (w - 65);
      let amp = 0.15 + Math.sin(time * 3 + idx) * 0.05;
      
      // Fundamental 60Hz peak
      if (freq === 60) amp = 0.7 + Math.sin(time * 2) * 0.1;
      // Bearing defect 120Hz peak under fault
      if (freq === 120 && isFault) amp = 0.95;
      if (freq === 240 && isFault) amp = 0.65;

      const barH = amp * (h - 45);
      const color = amp > 0.8 ? '#EF4444' : amp > 0.5 ? '#FFAB40' : '#00E5FF';

      ctx.fillStyle = color;
      ctx.fillRect(x - 6, h - 20 - barH, 12, barH);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '600 7px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(`${freq}Hz`, x, h - 8);
    });

    ctx.fillStyle = '#FFAB40';
    ctx.font = '700 8px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('FFT Spectrum: 1X/2X Bearing Harmonics', 35, 12);
  }

  // ==========================================
  // 14. Conveyor Flow Canvas (Multi-Mode)
  // ==========================================
  function drawConveyorFlowCanvas() {
    const canvas = document.getElementById('canvas-conveyor');
    const strip = document.getElementById('stations-strip');
    if (!canvas || !strip) return;
    
    const ctx = canvas.getContext('2d');
    
    // Synchronize canvas width to match the exact scrollable width of the station cards strip below
    const totalWidth = Math.max(strip.scrollWidth, strip.clientWidth);
    if (canvas.width !== totalWidth && totalWidth > 0) {
      canvas.width = totalWidth;
    }
    const w = canvas.width;
    const h = canvas.height = 155;

    ctx.clearRect(0, 0, w, h);

    const stations = sim.stations;
    const totalStations = stations.length;

    // Get exact X center of each station card node from DOM for 1-to-1 alignment
    const stationPositions = [];
    stations.forEach((st, i) => {
      const nodeEl = document.getElementById(`node-${st.id}`);
      if (nodeEl && nodeEl.offsetWidth > 0) {
        stationPositions.push(nodeEl.offsetLeft + nodeEl.offsetWidth / 2);
      } else {
        const fallbackStep = (w - 60) / Math.max(1, totalStations - 1);
        stationPositions.push(30 + i * fallbackStep);
      }
    });

    if (currentConveyorViewMode === '3D') {
      drawConveyor3DIsometric(ctx, w, h, stations, stationPositions);
      return;
    } else if (currentConveyorViewMode === 'ENERGY') {
      drawConveyorEnergyThermal(ctx, w, h, stations, stationPositions);
      return;
    }

    // 2D Track Flow (Default aligned view)
    const trackY = 82;

    // Zone backgrounds aligned with dynamic line config
    const count = stations.length;
    const cfgZones = (sim.config && sim.config.zones) ? sim.config.zones : [
      { name: 'Body', start: 1, end: Math.round(count * 0.28) },
      { name: 'Paint', start: Math.round(count * 0.28) + 1, end: Math.round(count * 0.57) },
      { name: 'Assembly', start: Math.round(count * 0.57) + 1, end: count }
    ];

    const zones = cfgZones.map(z => {
      const isBody = z.name.toLowerCase().includes('body');
      const isPaint = z.name.toLowerCase().includes('paint');
      const sIdx = Math.max(0, Math.min(stations.length - 1, z.start - 1));
      const eIdx = Math.max(0, Math.min(stations.length - 1, z.end - 1));
      return {
        name: z.name.toUpperCase(),
        start: sIdx,
        end: eIdx,
        color: isBody ? 'rgba(0,229,255,0.05)' : isPaint ? 'rgba(41,182,246,0.05)' : 'rgba(16,185,129,0.05)',
        border: isBody ? 'rgba(0,229,255,0.2)' : isPaint ? 'rgba(41,182,246,0.2)' : 'rgba(16,185,129,0.2)',
        accent: isBody ? '#00E5FF' : isPaint ? '#29B6F6' : '#10B981'
      };
    });

    zones.forEach(z => {
      const stStart = stations[z.start];
      const stEnd = stations[z.end];
      if (!stStart || !stEnd) return;
      const nodeStart = document.getElementById(`node-${stStart.id}`);
      const nodeEnd = document.getElementById(`node-${stEnd.id}`);
      const x1 = nodeStart ? nodeStart.offsetLeft - 4 : (stationPositions[z.start] || 0) - 40;
      const x2 = nodeEnd ? nodeEnd.offsetLeft + nodeEnd.offsetWidth + 4 : (stationPositions[z.end] || 100) + 40;
      
      // Zone background container card on canvas
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.roundRect(x1, 10, x2 - x1, h - 20, 10);
      ctx.fill();
      ctx.strokeStyle = z.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Zone label header
      ctx.fillStyle = z.accent;
      ctx.font = '700 10px Inter';
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.85;
      ctx.fillText(z.name, (x1 + x2) / 2, 26);
      ctx.globalAlpha = 1.0;
    });

    // Main conveyor track rails
    const minX = stationPositions[0] - 20;
    const maxX = stationPositions[stationPositions.length - 1] + 20;

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(minX, trackY - 8);
    ctx.lineTo(maxX, trackY - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(minX, trackY + 8);
    ctx.lineTo(maxX, trackY + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated flow particles on track
    const time = performance.now() / 1000;
    const particleCount = 40;
    for (let p = 0; p < particleCount; p++) {
      const px = minX + ((time * 50 + p * ((maxX - minX) / particleCount)) % (maxX - minX));
      ctx.fillStyle = 'rgba(0,229,255,0.3)';
      ctx.beginPath();
      ctx.arc(px, trackY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Connection lines between stations
    for (let i = 0; i < totalStations - 1; i++) {
      const sx = stationPositions[i];
      const nx = stationPositions[i + 1];
      const st = stations[i];
      const lineColor = st.isBlocked ? 'rgba(245,158,11,0.6)' : st.isStarved ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)';
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = st.isBlocked ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + 18, trackY);
      ctx.lineTo(nx - 18, trackY);
      ctx.stroke();
    }

    // Draw each station node on canvas centered directly over station card below
    stations.forEach((st, i) => {
      const sx = stationPositions[i];
      const radius = 15;
      const ringRadius = radius + 5;
      const bufferRatio = st.wipCount / st.maxBuffer;

      // Outer buffer ring background
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(sx, trackY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Buffer ring fill
      const fillAngle = bufferRatio * Math.PI * 2;
      const ringColor = bufferRatio > 0.8 ? '#EF4444' : bufferRatio > 0.5 ? '#FFAB40' : '#10B981';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(sx, trackY, ringRadius, -Math.PI / 2, -Math.PI / 2 + fillAngle);
      ctx.stroke();

      // Station circle fill
      let stationColor = '#00E5FF';
      if (st.zone === 'Paint') stationColor = '#29B6F6';
      else if (st.zone === 'Assembly') stationColor = '#10B981';

      if (st.isBottleneck) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 4);
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = 14 + pulse * 10;
        ctx.fillStyle = `rgba(239,68,68,${0.8 + pulse * 0.2})`;
      } else if (st.isPredictedBottleneck) {
        ctx.shadowColor = '#FFAB40';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255,171,64,0.85)';
      } else if (st.isBlocked) {
        ctx.shadowColor = '#F59E0B';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(245,158,11,0.6)';
      } else if (st.isStarved) {
        ctx.shadowColor = '#8B5CF6';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(139,92,246,0.6)';
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = `${stationColor}26`;
      }

      ctx.beginPath();
      ctx.arc(sx, trackY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Circle border
      ctx.strokeStyle = st.isBottleneck ? '#EF4444' : st.isPredictedBottleneck ? '#FFAB40' : st.isBlocked ? '#F59E0B' : st.isStarved ? '#8B5CF6' : `${stationColor}80`;
      ctx.lineWidth = st.isBottleneck || st.isPredictedBottleneck ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(sx, trackY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Station ID inside circle (e.g. S1, S2, S35)
      ctx.fillStyle = st.isBottleneck || st.isPredictedBottleneck ? '#ffffff' : 'rgba(255,255,255,0.9)';
      ctx.font = '800 10px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.id, sx, trackY);

      // Cycle time label above station circle
      const cycleRatio = st.actualCycle / st.targetCycle;
      ctx.fillStyle = cycleRatio > 1.3 ? '#EF4444' : cycleRatio > 1.1 ? '#FFAB40' : 'rgba(255,255,255,0.6)';
      ctx.font = '600 9px Inter';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${st.actualCycle.toFixed(0)}s`, sx, trackY - ringRadius - 4);

      // Anomaly indicator icon
      if (st.anomalyFlags.length > 0) {
        ctx.fillStyle = '#EF4444';
        ctx.font = '11px Inter';
        ctx.textBaseline = 'bottom';
        ctx.fillText('⚠', sx + radius, trackY - radius);
      }
    });

    // Vehicles moving along track
    sim.vehicles.forEach(v => {
      if (v.stationIdx >= totalStations) return;
      const sx = stationPositions[v.stationIdx];
      const nx = v.stationIdx < totalStations - 1 ? stationPositions[v.stationIdx + 1] : sx;
      const vx = sx + (nx - sx) * (v.progressPct / 100);

      // Vehicle dot glow
      ctx.fillStyle = v.modelColor;
      ctx.shadowColor = v.modelColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(vx, trackY - 22, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Integrated Legend at bottom of canvas
    const legendY = h - 14;
    const legends = [
      { color: '#10B981', label: 'Healthy' },
      { color: '#FFAB40', label: 'Predicted' },
      { color: '#EF4444', label: 'Bottleneck' },
      { color: '#F59E0B', label: 'Blocked' },
      { color: '#8B5CF6', label: 'Starved' }
    ];
    ctx.font = '600 9px Inter';
    ctx.textBaseline = 'middle';
    let lx = 35;
    legends.forEach(l => {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.arc(lx, legendY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(l.label, lx + 8, legendY);
      lx += ctx.measureText(l.label).width + 26;
    });
  }

  // Mode 3D Isometric Factory Grid Renderer
  function drawConveyor3DIsometric(ctx, w, h, stations, stationPositions) {
    const time = performance.now() / 1000;
    const trackY = 90;

    // Isometric Grid Background
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 15);
      ctx.lineTo(x - 40, h - 15);
      ctx.stroke();
    }

    const minX = stationPositions[0] - 25;
    const maxX = stationPositions[stationPositions.length - 1] + 25;

    // Track 3D Base
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.moveTo(minX, trackY - 12);
    ctx.lineTo(maxX, trackY - 12);
    ctx.lineTo(maxX - 15, trackY + 15);
    ctx.lineTo(minX - 15, trackY + 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    ctx.stroke();

    stations.forEach((st, i) => {
      const sx = stationPositions[i];
      const sy = trackY;
      const isAlt = st.zone === 'Paint';
      const isAssy = st.zone === 'Assembly';
      const baseColor = st.isBottleneck ? '#EF4444' : st.isPredictedBottleneck ? '#FFAB40' : st.isBlocked ? '#F59E0B' : isAlt ? '#29B6F6' : isAssy ? '#10B981' : '#00E5FF';

      // 3D Station Cube
      const pw = 28, ph = 20, pd = 10;
      const px = sx - pw / 2;
      const py = sy - ph / 2;

      // Top face
      ctx.fillStyle = st.isBottleneck ? 'rgba(239,68,68,0.7)' : `${baseColor}33`;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + pw, py);
      ctx.lineTo(px + pw - pd, py - pd);
      ctx.lineTo(px - pd, py - pd);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = st.isBottleneck ? 2 : 1;
      ctx.stroke();

      // Front face
      ctx.fillStyle = st.isBottleneck ? 'rgba(239,68,68,0.5)' : `${baseColor}1A`;
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.fill();
      ctx.stroke();

      // 3D Arm
      const armAngle = Math.sin(time * 2 + i) * 0.4;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 4, py - pd / 2);
      ctx.lineTo(sx - 4 + Math.cos(armAngle) * 12, py - pd / 2 - 14);
      ctx.lineTo(sx + Math.cos(armAngle + 0.8) * 8, py - pd / 2 - 24);
      ctx.stroke();

      // Welding sparks on bottleneck
      if (st.isBottleneck || (i % 4 === 0)) {
        ctx.fillStyle = st.isBottleneck ? '#FFD700' : '#80D8FF';
        for (let s = 0; s < 3; s++) {
          const spX = sx + Math.cos(armAngle + 0.8) * 8 + (Math.random() * 6 - 3);
          const spY = py - pd / 2 - 24 + (Math.random() * 6 - 3);
          ctx.fillRect(spX, spY, 1.5, 1.5);
        }
      }

      ctx.fillStyle = '#fff';
      ctx.font = '800 9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(st.id, sx - pd / 2, py + ph / 2 + 3);
    });

    sim.vehicles.forEach(v => {
      if (v.stationIdx >= stations.length) return;
      const sx = stationPositions[v.stationIdx];
      const nx = v.stationIdx < stations.length - 1 ? stationPositions[v.stationIdx + 1] : sx;
      const vx = sx + (nx - sx) * (v.progressPct / 100);

      ctx.fillStyle = v.modelColor;
      ctx.beginPath();
      ctx.roundRect(vx - 10, trackY - 24, 20, 9, 2);
      ctx.fill();
    });
  }

  // Mode Energy & Thermal Matrix Renderer
  function drawConveyorEnergyThermal(ctx, w, h, stations, stationPositions) {
    const time = performance.now() / 1000;
    const trackY = 85;

    stations.forEach((st, i) => {
      const sx = stationPositions[i];
      const temp = st.inferred.temperature !== null ? st.inferred.temperature : st.measurements.temperature;
      const normTemp = Math.min(1.0, Math.max(0, (temp - 20) / 140));

      const grad = ctx.createRadialGradient(sx, trackY, 4, sx, trackY, 40);
      const heatColor = normTemp > 0.5 ? `rgba(239, 68, 68, ${normTemp * 0.45})` : `rgba(0, 229, 255, ${0.1 + normTemp * 0.2})`;
      grad.addColorStop(0, heatColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, trackY, 40, 0, Math.PI * 2);
      ctx.fill();

      // Power kW bar
      const kW = st.isBottleneck ? 78 + Math.sin(time * 3 + i) * 6 : 32 + (st.actualCycle / 60) * 20 + Math.sin(time * 2 + i) * 4;
      const barH = (kW / 90) * 38;
      const barColor = kW > 65 ? '#EF4444' : kW > 45 ? '#FFAB40' : '#10B981';

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sx - 6, trackY - 42, 12, 38);
      ctx.fillStyle = barColor;
      ctx.fillRect(sx - 6, trackY - 4 - barH, 12, barH);

      ctx.fillStyle = '#fff';
      ctx.font = '600 8px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(`${kW.toFixed(0)}kW`, sx, trackY - 45);

      ctx.fillStyle = st.isBottleneck ? '#EF4444' : 'rgba(255,255,255,0.1)';
      ctx.strokeStyle = barColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, trackY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '800 9px Inter';
      ctx.fillText(st.id, sx, trackY + 3);

      ctx.fillStyle = temp > 60 ? '#EF4444' : '#00E5FF';
      ctx.font = '600 8px Inter';
      ctx.fillText(`${temp.toFixed(0)}°C`, sx, trackY + 22);
    });
  }

  // ==========================================
  // 15. Vehicle Quality Thread + Network Graph (Layer 2)
  // ==========================================
  function renderVehicleThread() {
    // Populate VIN chips dynamically
    const container = document.getElementById('vin-chip-container');
    if (container) {
      // Collect candidate vehicles: scenario vehicles + live vehicles with defects + recent completed
      const defectVehicles = sim.vehicles.filter(v => v.latentDefects && v.latentDefects.length > 0);
      const candidates = [
        { vin: 'VIN-2026-8842', tag: '🔴 Body Defect (S4)' },
        { vin: 'VIN-2026-8847', tag: '🔴 Paint Defect (S16)' }
      ];

      defectVehicles.slice(0, 4).forEach(v => {
        const def = v.latentDefects[0];
        candidates.push({
          vin: v.vin,
          tag: def.surfaced ? `🔴 Gate ${def.surfacedAt}` : `🟡 Latent ${def.originStation}`
        });
      });

      sim.completedVehicles.slice(0, 3).forEach(v => {
        if (!candidates.some(c => c.vin === v.vin)) {
          candidates.push({ vin: v.vin, tag: '🟢 Clean' });
        }
      });

      // Render chips if changed
      const chipSig = candidates.map(c => c.vin + c.tag).join('|') + '|' + selectedVinId;
      if (container.dataset.signature !== chipSig) {
        container.dataset.signature = chipSig;
        container.innerHTML = '';
        candidates.forEach(c => {
          const chip = document.createElement('div');
          chip.className = `chip ${c.vin === selectedVinId ? 'active' : ''}`;
          chip.style.cssText = `cursor:pointer; display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:12px; margin:2px; font-size:0.75rem; background:${c.vin === selectedVinId ? 'rgba(0,229,255,0.25)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${c.vin === selectedVinId ? '#00E5FF' : 'rgba(255,255,255,0.1)'};`;
          chip.innerHTML = `<span style="font-weight:700;">${c.vin}</span> <span style="font-size:0.65rem; opacity:0.8;">${c.tag}</span>`;
          chip.onclick = () => { selectedVinId = c.vin; renderVehicleThread(); };
          container.appendChild(chip);
        });
      }
    }

    const threadData = qualityEngine.getVehicleThread(selectedVinId, sim.vehicles, sim.completedVehicles);
    if (!threadData) return;

    const tTitle = document.getElementById('thread-vin-title');
    if (tTitle) {
      const modeLabel = threadData.isCuratedDemo ? ' <span style="font-size:0.65rem; color:#4FC3F7; background:rgba(79,195,247,0.15); padding:2px 6px; border-radius:4px; font-weight:normal;">⭐ Curated Walkthrough Baseline</span>' : ' <span style="font-size:0.65rem; color:#10B981; background:rgba(16,185,129,0.15); padding:2px 6px; border-radius:4px; font-weight:normal;">🔴 Live In-Flight Simulated Vehicle</span>';
      tTitle.innerHTML = `${selectedVinId} ${modeLabel}`;
    }

    const dGate = document.getElementById('thread-detected-gate');
    if (dGate) {
      if (threadData.surfaced) {
        dGate.className = 'badge-tag alert-badge';
        dGate.style.background = 'rgba(239,68,68,0.2)';
        dGate.style.color = '#EF4444';
        dGate.textContent = `🔴 DETECTED (${threadData.detectedStationName || 'Gate'})`;
      } else if (threadData.originStation) {
        dGate.className = 'badge-tag warning-badge';
        dGate.style.background = 'rgba(255,171,64,0.2)';
        dGate.style.color = '#FFAB40';
        dGate.textContent = `🟡 LATENT DEFECT (In-Transit)`;
      } else {
        dGate.className = 'badge-tag in-control-badge';
        dGate.style.background = 'rgba(16,185,129,0.2)';
        dGate.style.color = '#10B981';
        dGate.textContent = '🟢 QUALITY CLEAN';
      }
    }
    
    const dDesc = document.getElementById('thread-defect-desc');
    if (dDesc) {
      if (threadData.originDefect) {
        dDesc.innerHTML = `<span style="color:#EF4444; font-weight:700;">${threadData.defectType}</span> — ${threadData.originDefect} <span style="color:#4FC3F7; font-size:0.75rem;">(Origin Stress: ${threadData.stressScore || 50}%)</span>`;
      } else {
        dDesc.textContent = 'No defects recorded — all inspected parameters within 3σ tolerance';
      }
    }

    renderThreadTimeline(threadData);
    drawNetworkGraph();
  }

  // Builds the step-by-step "quality thread" timeline: where the defect
  // originated, every station the vehicle passed through on the way to
  // detection, and which of those were sensor blind spots. This was the
  // missing piece - the list existed in the HTML/CSS but nothing ever
  // populated it, so the panel rendered empty.
  function renderThreadTimeline(threadData) {
    const list = document.getElementById('thread-timeline-list');
    if (!list) return;

    const steps = [];

    if (threadData.originStation) {
      steps.push({
        id: threadData.originStation,
        type: 'origin',
        title: `${threadData.originStationName || threadData.originStation} — Origin`,
        sub: `${threadData.originDefect || 'Defect introduced'} · sensor status: ${threadData.originSensorStatus || 'UNKNOWN'}`
      });
    }

    (threadData.intermediateStations || []).forEach(sid => {
      const isBlind = (threadData.blindSpotsTraversed || []).includes(sid);
      steps.push({
        id: sid,
        type: isBlind ? 'blindspot' : 'transit',
        title: `Station ${sid.replace('S', '')}`,
        sub: isBlind ? 'Passed through unmonitored — sensor blind spot' : 'Monitored pass-through, no anomaly'
      });
    });

    if (threadData.detectedAtStation) {
      steps.push({
        id: threadData.detectedAtStation,
        type: 'detection',
        title: `${threadData.detectedStationName || threadData.detectedAtStation} — Detected`,
        sub: `${threadData.defectType || 'Defect'} flagged here`
      });
    }

    // renderVehicleThread runs every animation frame, so guard on a
    // signature and skip the rebuild when nothing changed - otherwise the
    // step-in animation below would restart 60x a second and never actually
    // appear to move.
    const signature = selectedVinId + '|' + steps.map(s => s.id + s.type).join(',');
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;

    list.innerHTML = '';

    if (steps.length === 0) {
      const li = document.createElement('li');
      li.className = 'timeline-step timeline-clean';
      li.innerHTML = `<span class="timeline-title">No defects recorded</span><span class="timeline-sub">Quality passport is clean so far</span>`;
      list.appendChild(li);
      return;
    }

    steps.forEach((step, i) => {
      const li = document.createElement('li');
      li.className = `timeline-step timeline-${step.type}`;
      li.style.animationDelay = `${i * 0.12}s`;
      li.innerHTML = `
        <span class="timeline-title">${step.title}</span>
        <span class="timeline-sub">${step.sub}</span>
      `;
      list.appendChild(li);
    });
  }

  function drawNetworkGraph() {
    const canvas = document.getElementById('canvas-network-graph');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 150;

    const graphData = qualityEngine.getNetworkGraphData(selectedVinId);
    if (!graphData) return;

    ctx.clearRect(0, 0, w, h);

    // Simple horizontal layout for nodes
    const nodes = graphData.nodes;
    const edges = graphData.edges;
    
    if(nodes.length === 0) return;

    const dx = w / (nodes.length + 1);
    const cy = h / 2;

    const pos = {};
    nodes.forEach((n, i) => {
      pos[n.id] = { x: dx * (i + 1), y: cy + (i % 2 === 0 ? -20 : 20) };
    });

    // Edges
    edges.forEach(e => {
      const p1 = pos[e.from];
      const p2 = pos[e.to];
      if(!p1 || !p2) return;
      
      const isDefectPath = graphData.defectPath.includes(e.from) && graphData.defectPath.includes(e.to);
      
      ctx.strokeStyle = isDefectPath ? 'rgba(239, 68, 68, 0.8)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = isDefectPath ? 2 : 1;
      
      if (isDefectPath) {
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -performance.now() / 50;
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    ctx.setLineDash([]);

    // Nodes
    nodes.forEach(n => {
      const p = pos[n.id];
      ctx.fillStyle = n.type === 'origin' ? '#EF4444' : n.type === 'detection' ? '#3B82F6' : n.type === 'blindspot' ? '#FFAB40' : '#10B981';
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.font = '9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(n.id, p.x, p.y - 12);
    });

    // Animated pulse traveling along the defect path - this is the "quality
    // thread" itself, visually retracing the vehicle's journey from the
    // origin station to where the defect was actually caught.
    if (graphData.defectPath && graphData.defectPath.length > 1) {
      const pathPoints = graphData.defectPath.map(id => pos[id]).filter(Boolean);
      if (pathPoints.length > 1) {
        const segments = pathPoints.length - 1;
        const cycleMs = 3000;
        const t = (performance.now() % cycleMs) / cycleMs; // 0 -> 1 loop
        const segFloat = t * segments;
        const segIndex = Math.min(segments - 1, Math.floor(segFloat));
        const segT = segFloat - segIndex;
        const p1 = pathPoints[segIndex];
        const p2 = pathPoints[segIndex + 1];
        const px = p1.x + (p2.x - p1.x) * segT;
        const py = p1.y + (p2.y - p1.y) * segT;

        const glow = ctx.createRadialGradient(px, py, 0, px, py, 12);
        glow.addColorStop(0, 'rgba(239, 68, 68, 0.9)');
        glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ==========================================
  // 15b. Layer 3 — Ranked Recall Set & Backward Trace
  // ==========================================
  function runBackwardTrace(stationId) {
    const targetStation = stationId || selectedStationId || 'S4';
    const report = sim.generateRecallSet(targetStation);
    renderRecallSetPanel(report);

    // Feed alert
    const list = document.getElementById('live-activity-feed-list');
    if (list && report) {
      const time = new Date().toLocaleTimeString();
      const li = document.createElement('li');
      li.className = 'feed-item';
      li.style.color = '#EF4444';
      li.style.borderLeft = '3px solid #EF4444';
      li.style.paddingLeft = '6px';
      li.innerHTML = `<strong>[${time}]</strong> ⚡ <strong>BACKWARD TRACE EXECUTED:</strong> Query on ${report.stationName} identified <strong>${report.totalAtRisk} likely affected units</strong> (${report.criticalCount} Critical, ${report.completedAtRisk} in Yard).`;
      list.insertBefore(li, list.firstChild);
    }
  }
  window.runBackwardTrace = runBackwardTrace;

  function renderRecallSetPanel(report) {
    if (!report) {
      report = sim.activeRecallSet || sim.generateRecallSet(selectedStationId || 'S4');
    }
    if (!report) return;

    const stationLabel = document.getElementById('recall-station-label');
    if (stationLabel) {
      stationLabel.textContent = `Suspect Station: ${report.suspectStationId} (${report.stationName || report.suspectStationId})`;
    }

    const expBadge = document.getElementById('recall-exposure-badge');
    if (expBadge) {
      expBadge.textContent = `$${(report.estimatedExposureValue / 1000).toFixed(0)}k Est. Value at Risk`;
    }

    const summaryBox = document.getElementById('recall-summary-metrics');
    if (summaryBox) {
      summaryBox.innerHTML = `
        <div style="background:rgba(255,255,255,0.03); padding:0.35rem 0.4rem; border-radius:4px; text-align:center; border:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:0.55rem; color:var(--text-muted);">TOTAL AT RISK</div>
          <div style="font-size:0.85rem; font-weight:800; color:#EF4444;">${report.totalAtRisk} Units</div>
        </div>
        <div style="background:rgba(255,255,255,0.03); padding:0.35rem 0.4rem; border-radius:4px; text-align:center; border:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:0.55rem; color:var(--text-muted);">CRITICAL (>75%)</div>
          <div style="font-size:0.85rem; font-weight:800; color:#FF3D00;">${report.criticalCount} Units</div>
        </div>
        <div style="background:rgba(255,255,255,0.03); padding:0.35rem 0.4rem; border-radius:4px; text-align:center; border:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:0.55rem; color:var(--text-muted);">YARD DISPATCH HOLD</div>
          <div style="font-size:0.85rem; font-weight:800; color:#FFAB40;">${report.completedAtRisk} Yards</div>
        </div>
        <div style="background:rgba(255,255,255,0.03); padding:0.35rem 0.4rem; border-radius:4px; text-align:center; border:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:0.55rem; color:var(--text-muted);">IN-TRANSIT DIVERT</div>
          <div style="font-size:0.85rem; font-weight:800; color:#00E5FF;">${report.inTransitAtRisk} Units</div>
        </div>
      `;
    }

    const rankedListBox = document.getElementById('recall-ranked-list');
    if (rankedListBox) {
      if (report.rankedUnits.length === 0) {
        rankedListBox.innerHTML = `<div style="font-size:0.75rem; color:#10B981; padding:0.5rem; text-align:center;">✓ No units traversed suspect window under stress</div>`;
        return;
      }

      rankedListBox.innerHTML = report.rankedUnits.map((u, i) => {
        const riskColor = u.riskScore >= 75 ? '#EF4444' : u.riskScore >= 50 ? '#FFAB40' : '#00E5FF';
        const isSelected = (u.vin === selectedVinId);
        return `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:0.35rem 0.5rem; background:${isSelected ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.02)'}; border-radius:5px; border-left:3px solid ${riskColor}; cursor:pointer; transition:background 0.15s ease;" onclick="selectedVinId='${u.vin}'; renderVehicleThread();" title="Click to inspect VIN audit trail">
            <div style="display:flex; align-items:center; gap:0.4rem; min-width:120px;">
              <span style="font-weight:800; font-size:0.75rem; color:${riskColor};">#${i + 1}</span>
              <div>
                <div style="font-weight:700; font-size:0.75rem; color:#fff;">${u.vin}</div>
                <div style="font-size:0.6rem; color:var(--text-muted);">${u.model}</div>
              </div>
            </div>

            <div style="flex:1; max-width:140px;">
              <div style="display:flex; justify-content:space-between; font-size:0.65rem; margin-bottom:0.1rem;">
                <span style="color:${riskColor}; font-weight:700;">${u.statusCategory}</span>
                <span style="color:#fff; font-weight:700;">${u.riskScore}% Risk</span>
              </div>
              <div style="width:100%; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
                <div style="width:${u.riskScore}%; height:100%; background:${riskColor};"></div>
              </div>
            </div>

            <div style="font-size:0.65rem; min-width:130px; text-align:right;">
              <div style="color:#4FC3F7; font-weight:600;">${u.currentLocation}</div>
              <div style="color:var(--text-muted); font-size:0.58rem;">Stress @ ${u.suspectStation}: ${u.stressAtVisit}%</div>
            </div>

            <button style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#fff; font-size:0.6rem; padding:2px 6px; border-radius:3px; cursor:pointer;" onclick="event.stopPropagation(); selectedVinId='${u.vin}'; renderVehicleThread();">
              Trace ➔
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // 16. Intervention Simulator (Graphical)
  // ==========================================
  let mcHistogramData = null; // { throughputSamples, starvSamples, result }
  let mcAnimProgress = 0;     // 0..1 for histogram animation

  function drawInterventionGauges() {
    // Speed gauge
    const cSpeed = document.getElementById('canvas-speed-gauge');
    const cBuffer = document.getElementById('canvas-buffer-gauge');
    if (!cSpeed || !cBuffer) return;

    const speedVal = parseFloat(document.getElementById('sim-speed-slider')?.value || 100);
    const bufferVal = parseInt(document.getElementById('sim-buffer-slider')?.value || 2);

    // Update labels
    const sLabel = document.getElementById('speed-val-label');
    const bLabel = document.getElementById('buffer-val-label');
    if (sLabel) sLabel.textContent = speedVal + '%';
    if (bLabel) bLabel.textContent = bufferVal;

    // Station badge
    const badge = document.getElementById('intervention-station-badge');
    if (badge) badge.textContent = selectedStationId;

    drawArcGauge(cSpeed, speedVal, 70, 130, 'Speed', speedVal > 110 ? '#EF4444' : speedVal > 100 ? '#FFAB40' : '#00E5FF');
    drawArcGauge(cBuffer, bufferVal, 0, 4, 'Buffer', bufferVal >= 3 ? '#10B981' : bufferVal >= 2 ? '#FFAB40' : '#EF4444');
  }

  function drawArcGauge(canvas, value, min, max, label, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h - 8;
    const radius = Math.min(cx, cy) - 6;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const valueAngle = startAngle + ratio * Math.PI;
    const time = performance.now() / 1000;

    // Background arc
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();

    // Colored arc
    const grad = ctx.createLinearGradient(0, cy, w, cy);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, valueAngle);
    ctx.stroke();

    // Glowing needle dot
    const needleX = cx + Math.cos(valueAngle) * radius;
    const needleY = cy + Math.sin(valueAngle) * radius;
    const pulse = 0.7 + 0.3 * Math.sin(time * 4);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * pulse;
    ctx.beginPath();
    ctx.arc(needleX, needleY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Center value text
    ctx.fillStyle = '#fff';
    ctx.font = '800 14px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(String(value), cx, cy - 2);
  }

  function drawMCHistogram() {
    const canvas = document.getElementById('canvas-mc-histogram');
    if (!canvas || !mcHistogramData) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 120;
    ctx.clearRect(0, 0, w, h);

    const samples = mcHistogramData.throughputSamples;
    if (!samples || samples.length === 0) return;

    const bins = 30;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const range = max - min || 1;
    const binWidth = range / bins;
    const counts = new Array(bins).fill(0);
    samples.forEach(v => { counts[Math.min(bins - 1, Math.floor((v - min) / binWidth))]++; });
    const maxCount = Math.max(...counts);

    const barW = (w - 20) / bins;
    const progress = Math.min(1, mcAnimProgress);
    const time = performance.now() / 1000;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Bars
    counts.forEach((c, i) => {
      if (i > bins * progress) return;
      const barH = (c / maxCount) * (h - 25) * Math.min(1, progress * 2 - i / bins);
      if (barH <= 0) return;
      const x = 10 + i * barW;
      const binMidVal = min + (i + 0.5) * binWidth;

      // Color based on whether gain is positive
      const isGood = binMidVal > 0;
      const baseColor = isGood ? '#10B981' : '#EF4444';
      const grad = ctx.createLinearGradient(0, h - barH, 0, h);
      grad.addColorStop(0, baseColor + 'CC');
      grad.addColorStop(1, baseColor + '40');
      ctx.fillStyle = grad;
      ctx.fillRect(x, h - barH, barW - 1, barH);

      // Top glow
      ctx.fillStyle = baseColor + '30';
      ctx.fillRect(x, h - barH - 2, barW - 1, 3);
    });

    // Mean line
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const meanX = 10 + ((mean - min) / range) * (w - 20);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(meanX, 5);
    ctx.lineTo(meanX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Mean label
    ctx.fillStyle = '#fff';
    ctx.font = '700 9px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(`μ=${mean.toFixed(1)}`, meanX, 12);

    // Title
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '600 8px Inter';
    ctx.textAlign = 'left';
    ctx.fillText('THROUGHPUT DISTRIBUTION (500 SCENARIOS)', 10, 10);
  }

  function drawInterventionImpact() {
    const canvas = document.getElementById('canvas-intervention-impact');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 90;
    ctx.clearRect(0, 0, w, h);

    const st = sim.stations.find(s => s.id === selectedStationId);
    if (!st) return;

    const time = performance.now() / 1000;
    const speedVal = parseFloat(document.getElementById('sim-speed-slider')?.value || 100);
    const bufferVal = parseInt(document.getElementById('sim-buffer-slider')?.value || 2);

    // Calculate projected impact on selected station
    const currentCycle = st.actualCycle;
    const projectedCycle = currentCycle * (100 / speedVal);
    const currentBuffer = st.wipCount;
    const projectedBuffer = Math.min(st.maxBuffer, bufferVal);
    const currentTPH = Math.round(3600 / currentCycle);
    const projectedTPH = Math.round(3600 / projectedCycle);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, w, h);

    // Draw before/after comparison bars
    const metrics = [
      { label: 'Cycle Time', before: currentCycle, after: projectedCycle, unit: 's', lower: true },
      { label: 'Throughput', before: currentTPH, after: projectedTPH, unit: 'JPH', lower: false },
      { label: 'Buffer Load', before: currentBuffer, after: projectedBuffer, unit: '/' + st.maxBuffer, lower: true }
    ];

    const barH = 14;
    const gap = 8;
    const labelW = 65;
    const valueW = 45;
    const barArea = w - labelW - valueW * 2 - 20;

    metrics.forEach((m, i) => {
      const y = 12 + i * (barH + gap);
      const maxVal = Math.max(m.before, m.after, 1) * 1.2;
      const bW = (m.before / maxVal) * barArea;
      const aW = (m.after / maxVal) * barArea;
      const improved = m.lower ? m.after < m.before : m.after > m.before;

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '600 8px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(m.label, 5, y + barH / 2 + 3);

      // Before bar
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(labelW, y, bW, barH / 2 - 1);

      // After bar
      const afterColor = improved ? '#10B981' : '#EF4444';
      const pulse = 0.8 + 0.2 * Math.sin(time * 3 + i);
      ctx.fillStyle = afterColor + Math.round(pulse * 200).toString(16).padStart(2, '0');
      ctx.fillRect(labelW, y + barH / 2 + 1, aW, barH / 2 - 1);

      // Before value
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '600 8px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.fillText(m.before.toFixed(1) + m.unit, w - valueW, y + barH / 2 - 1);

      // After value
      ctx.fillStyle = afterColor;
      ctx.fillText(m.after.toFixed(1) + m.unit, w, y + barH / 2 - 1);

      // Arrow
      const delta = m.after - m.before;
      if (Math.abs(delta) > 0.01) {
        ctx.fillStyle = improved ? '#10B981' : '#EF4444';
        ctx.font = '700 8px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(improved ? '▼' : '▲', labelW + barArea + 8, y + barH / 2 + 3);
      }
    });

    // Title
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '600 7px Inter';
    ctx.textAlign = 'left';
    ctx.fillText(`PROJECTED IMPACT ON ${selectedStationId} (BEFORE / AFTER)`, 5, 8);
  }

  function initInterventionSimulator() {
    // Live slider input events for real-time gauge updates
    const speedSlider = document.getElementById('sim-speed-slider');
    const bufferSlider = document.getElementById('sim-buffer-slider');
    if (speedSlider) speedSlider.addEventListener('input', drawInterventionGauges);
    if (bufferSlider) bufferSlider.addEventListener('input', drawInterventionGauges);

    const btnSim = document.getElementById('btn-run-simulation');
    if (btnSim) {
      btnSim.addEventListener('click', () => {
        btnSim.classList.add('pulse');
        const speed = parseFloat(document.getElementById('sim-speed-slider')?.value || 100);
        const buffer = parseInt(document.getElementById('sim-buffer-slider')?.value || 2);
        
        // Run 500 Monte Carlo iterations
        const res = sim.runMonteCarloSim(speed, buffer);

        // Generate histogram data
        const throughputSamples = [];
        for (let i = 0; i < 500; i++) {
          let tp = 0;
          for (let j = 0; j < sim.stations.length; j++) {
            const s = sim.stations[j];
            const cycle = s.actualCycle * (1 - speed / 100) * (0.9 + Math.random() * 0.2);
            tp += 3600 / cycle;
          }
          throughputSamples.push((tp / sim.stations.length) * (1 + buffer / 100));
        }
        mcHistogramData = { throughputSamples, result: res };
        mcAnimProgress = 0;

        // Animate histogram filling
        const animStart = performance.now();
        function animateHist() {
          mcAnimProgress = Math.min(1, (performance.now() - animStart) / 800);
          drawMCHistogram();
          if (mcAnimProgress < 1) requestAnimationFrame(animateHist);
        }
        requestAnimationFrame(animateHist);

        // Rich results grid
        const grid = document.getElementById('mc-results-grid');
        if (grid) {
          grid.innerHTML = `
            <div class="mc-metric-card positive">
              <span class="mc-val">+${res.avgThroughputGain.toFixed(1)}</span>
              <span class="mc-lbl">TPut Gain (JPH)</span>
            </div>
            <div class="mc-metric-card ${res.avgStarvationReduction > 5 ? 'positive' : 'neutral'}">
              <span class="mc-val">${res.avgStarvationReduction.toFixed(1)}%</span>
              <span class="mc-lbl">Starv. Reduction</span>
            </div>
            <div class="mc-metric-card neutral">
              <span class="mc-val">${res.p80RecoveryTimeMin}m</span>
              <span class="mc-lbl">P80 Recovery</span>
            </div>
          `;
        }

        const outBox = document.getElementById('outcome-preview-box');
        if (outBox) outBox.style.display = 'block';

        setTimeout(() => btnSim.classList.remove('pulse'), 500);
      });
    }

    const btnApprove = document.getElementById('btn-approve-action');
    if (btnApprove) {
      btnApprove.addEventListener('click', () => {
        btnApprove.classList.add('pulse');
        sim.approveAction();

        const speedInput = document.getElementById('sim-speed-slider');
        const bufferInput = document.getElementById('sim-buffer-slider');
        if (speedInput) speedInput.value = 100;
        if (bufferInput) bufferInput.value = 2;

        const outBox = document.getElementById('outcome-preview-box');
        if (outBox) { outBox.style.display = 'none'; outBox.innerHTML = '<div class="mc-results-grid" id="mc-results-grid"></div>'; }

        mcHistogramData = null;
        drawInterventionGauges();

        const scenarioSelect = document.getElementById('select-scenario');
        if (scenarioSelect) scenarioSelect.value = 'normal';

        setTimeout(() => btnApprove.classList.remove('pulse'), 500);
        showToast('Action Approved: Bottleneck resolved and line reset to normal condition.', 'success');
      });
    }
  }

  // ==========================================
  // 17. Decision Loop Animation
  // ==========================================
  const decisionNodeIds = ['node-obs', 'node-prd', 'node-ver', 'node-sim', 'node-dec', 'node-lrn'];
  function initDecisionLoop() {
    // Initial state: first node active
    decisionNodeIds.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('active', i === 0);
      }
    });
  }

  let lastDecUpdate = 0;
  function updateDecisionLoop(now) {
    if (now - lastDecUpdate > 2500) {
      lastDecUpdate = now;
      decisionNodeIds.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.toggle('active', i === decisionLoopStep);
        }
      });
      decisionLoopStep = (decisionLoopStep + 1) % decisionNodeIds.length;
    }
  }

  // ==========================================
  // 18 & 19. Shift & Environment
  // ==========================================
  function updateShiftDisplay() {
    const el = document.getElementById('shift-indicator');
    if (el) {
      el.textContent = `Shift: ${sim.shiftState.name} | Fatg: ${(sim.shiftState.fatigueLevel*100).toFixed(0)}%`;
    }
  }

  function updateEnvironmentDisplay() {
    const el = document.getElementById('environment-display');
    if (el) {
      el.textContent = `Env: ${sim.environment.ambientTemp.toFixed(1)}°C, ${sim.environment.humidity.toFixed(0)}% RH`;
    }
  }

  // ==========================================
  // 20. Modelling Approach View
  // ==========================================
  function renderModellingView() {
    const summary = sim.getExplicitVsInferredSummary();
    const explicitTbody = document.querySelector('#explicit-params-table tbody');
    const inferredTbody = document.querySelector('#inferred-params-table tbody');
    
    if (explicitTbody) {
      explicitTbody.innerHTML = `
        <tr>
          <td>Cycle Time</td>
          <td>seconds</td>
          <td>Direct Timer / Optical Proximity</td>
          <td>S1-S35 (All)</td>
          <td><div class="conf-bar"><div class="fill" style="width: 98%">98%</div></div></td>
        </tr>
        <tr>
          <td>Torque</td>
          <td>Nm</td>
          <td>DC Tool Telemetry</td>
          <td>22 stations (Body/Assembly)</td>
          <td><div class="conf-bar"><div class="fill" style="width: 95%">95%</div></div></td>
        </tr>
        <tr>
          <td>Temperature</td>
          <td>°C</td>
          <td>Thermocouple / IR Sensors</td>
          <td>28 stations (Paint/Assembly)</td>
          <td><div class="conf-bar"><div class="fill" style="width: 97%">97%</div></div></td>
        </tr>
        <tr>
          <td>Vibration</td>
          <td>g</td>
          <td>Accelerometers (Body/Assembly)</td>
          <td>18 stations (Critical joints)</td>
          <td><div class="conf-bar"><div class="fill" style="width: 93%">93%</div></div></td>
        </tr>
        <tr>
          <td>Throughput</td>
          <td>cars/hr</td>
          <td>Line counters / optical sensors</td>
          <td>All stations</td>
          <td><div class="conf-bar"><div class="fill" style="width: 99%">99%</div></div></td>
        </tr>
      `;
    }

    if (inferredTbody) {
      inferredTbody.innerHTML = '';
      let rowHtml = '';
      sim.stations.forEach(station => {
        if (station.modellingApproach === 'inferred' || station.modellingApproach === 'hybrid') {
          const detail = evidenceEngine.getInferredParameterDetails(station);
          detail.forEach(d => {
            const confidence = Math.round(d.confidence * 100);
            rowHtml += `
              <tr>
                <td><strong>${station.id} - ${d.parameter.toUpperCase()}</strong></td>
                <td>${d.method === 'physics-inferred' ? '📐 Physics-Informed (PINN)' : '📊 Neighbor Interpolation'}</td>
                <td>${station.name}</td>
                <td><div class="conf-bar"><div class="fill" style="width: ${confidence}%">${confidence}%</div></div></td>
                <td>${d.method === 'physics-inferred' ? 'Residual bounds check' : 'Cross-validation'}</td>
              </tr>
            `;
          });
        }
      });
      inferredTbody.innerHTML = rowHtml || '<tr><td colspan="5" style="text-align:center; color: var(--text-muted)">Loading inferred models...</td></tr>';
    }
    
    const strip = document.getElementById('modelling-coverage-strip');
    if (strip) {
      strip.innerHTML = sim.stations.map(s => {
        const color = s.modellingApproach === 'explicit' ? '#10B981' : s.modellingApproach === 'hybrid' ? '#29B6F6' : '#6B7280';
        return `<div class="coverage-bar-segment" data-id="${s.id}" style="width:${100/35}%; height:20px; background-color:${color}; display:inline-block; cursor:pointer; transition: transform 0.1s;" title="${s.id}: ${s.modellingApproach}"></div>`;
      }).join('');

      // Add click listener
      strip.querySelectorAll('.coverage-bar-segment').forEach(seg => {
        seg.addEventListener('click', () => {
          const stationId = seg.dataset.id;
          const stObj = sim.stations.find(s => s.id === stationId);
          if (stObj) {
            renderModellingStationDetail(stObj);
            strip.querySelectorAll('.coverage-bar-segment').forEach(s => s.style.transform = 'none');
            seg.style.transform = 'scaleY(1.3)';
          }
        });
      });
    }

    renderSensorCatalog();
    renderSensorRoiTradeoffTable();
    updateMaintenanceWindowBadge();
  }

  function updateMaintenanceWindowBadge() {
    const badge = document.getElementById('mw-status-badge');
    if (!badge) return;
    const isOpen = sim.isMaintenanceWindowOpen();
    badge.textContent = isOpen ? '● WINDOW OPEN (PM / Shift Changeover)' : '● WINDOW CLOSED (Live Production Running)';
    badge.style.background = isOpen ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
    badge.style.color = isOpen ? '#10B981' : '#EF4444';
  }

  function setMaintenanceWindowEnforcement(enabled) {
    sim.maintenanceWindowGateEnabled = enabled;
    showToast(enabled ? '🔒 Maintenance Window OT Safety Gate Enabled' : '🔓 Maintenance Window Enforcement Bypassed', 'info');
    updateMaintenanceWindowBadge();
  }
  window.setMaintenanceWindowEnforcement = setMaintenanceWindowEnforcement;

  function toggleMaintenanceWindowManual() {
    sim.manualMaintenanceWindowOverride = !sim.manualMaintenanceWindowOverride;
    const isOpen = sim.isMaintenanceWindowOpen();
    showToast(isOpen ? '🕒 Maintenance Window Manually OPENED (Scheduled PM Simulation Active)' : '🔒 Maintenance Window Manually CLOSED (Active Line Running)', 'info');
    updateMaintenanceWindowBadge();
  }
  window.toggleMaintenanceWindowManual = toggleMaintenanceWindowManual;

  function toggleStationInstrumentation(stationId, forceBypass = false) {
    const res = sim.toggleSensorInstrumentation(stationId, forceBypass);
    if (!res) return;

    if (res.success === false) {
      showToast(`⚠️ ${res.reason}`, 'warning');
      return;
    }

    showToast(res.instrumented ? `✓ Retrofitted ${stationId} with IoT package ($35). Real-time telemetry active.` : `Removed sensor from ${stationId}. Switched to neighbor inference.`, res.instrumented ? 'success' : 'warn');

    // Feed alert
    const list = document.getElementById('live-activity-feed-list');
    if (list) {
      const time = new Date().toLocaleTimeString();
      const li = document.createElement('li');
      li.className = 'feed-item';
      li.style.color = res.instrumented ? '#00E5FF' : '#FFAB40';
      li.style.borderLeft = res.instrumented ? '3px solid #00E5FF' : '3px solid #FFAB40';
      li.style.paddingLeft = '6px';
      li.innerHTML = `<strong>[${time}]</strong> 🔌 <strong>SENSOR RETROFIT TOGGLE:</strong> ${stationId} instrumentation set to <strong>${res.instrumented ? 'EQUIPPED (0.2m Lead Time)' : 'UNINSTRUMENTED (Neighbor Inferred)'}</strong>. System FAR updated to ${res.roiSummary.currentFarPct}%.`;
      list.insertBefore(li, list.firstChild);
    }

    renderModellingView();
    const st = sim.stations.find(s => s.id === stationId);
    if (st) {
      renderModellingStationDetail(st);
      renderStationDetailsAndEvidence(st);
    }
  }
  window.toggleStationInstrumentation = toggleStationInstrumentation;

  function deployZoneRetrofitSensors(zone, forceBypass = false) {
    let res;
    if (zone === 'all') {
      res = sim.deployAllRetrofitSensors(null, forceBypass);
      if (res.deployedCount === 0 && sim.maintenanceWindowGateEnabled && !sim.isMaintenanceWindowOpen()) {
        showToast('⚠️ Deployment blocked by OT Safety Constraint: Outside scheduled maintenance window (MW-1: Shift Change 0–15m). Toggle window or bypass.', 'warning');
        return;
      }
      showToast(`⚡ Deployed full IoT retrofit package across ${res.deployedCount} stations ($${res.deployedCount * 35}). Lead time reduced to 0.2 min!`, 'success');
    } else {
      res = sim.deployAllRetrofitSensors(zone, forceBypass);
      if (res.deployedCount === 0 && sim.maintenanceWindowGateEnabled && !sim.isMaintenanceWindowOpen()) {
        showToast('⚠️ Deployment blocked by OT Safety Constraint: Outside scheduled maintenance window.', 'warning');
        return;
      }
      showToast(`⚡ Deployed IoT sensors to all ${zone} stations (${res.deployedCount} stations retrofitted).`, 'success');
    }

    renderModellingView();
  }
  window.deployZoneRetrofitSensors = deployZoneRetrofitSensors;

  function resetToBaselineCoverage() {
    const uninstrumentedStationIds = ['S3', 'S6', 'S9', 'S12', 'S15', 'S18', 'S22', 'S26', 'S29', 'S31', 'S33'];
    sim.stations.forEach(st => {
      const shouldInstrument = !uninstrumentedStationIds.includes(st.id);
      if (st.instrumented !== shouldInstrument) {
        sim.toggleSensorInstrumentation(st.id, true);
      }
    });
    showToast('↺ Reset sensor coverage to baseline ~70/30 reference configuration.', 'info');
    renderModellingView();
  }
  window.resetToBaselineCoverage = resetToBaselineCoverage;

  function applyTargetRetrofitCount(targetCount) {
    const uninstrumentedStationIds = ['S3', 'S6', 'S9', 'S12', 'S15', 'S18', 'S22', 'S26', 'S29', 'S31', 'S33'];
    sim.stations.forEach(st => {
      const shouldInstrument = !uninstrumentedStationIds.includes(st.id);
      if (st.instrumented !== shouldInstrument) {
        sim.toggleSensorInstrumentation(st.id);
      }
    });

    let retrofitted = 0;
    for (const sid of uninstrumentedStationIds) {
      if (retrofitted < targetCount) {
        sim.toggleSensorInstrumentation(sid);
        retrofitted++;
      }
    }
    showToast(`Simulating ${targetCount} added retrofit nodes ($${targetCount * 35} capex).`, 'info');
    renderModellingView();
  }
  window.applyTargetRetrofitCount = applyTargetRetrofitCount;

  function renderSensorRoiTradeoffTable() {
    const roiData = sim.getSensorRoiTradeoffTable();
    if (!roiData) return;

    // 1. Live Summary KPI Strip
    const strip = document.getElementById('sensor-roi-summary-strip');
    if (strip) {
      strip.innerHTML = `
        <div class="validation-metric-card" style="text-align:center;">
          <div style="font-size:0.65rem; color:var(--text-muted);">INSTRUMENTED COVERAGE</div>
          <div style="font-size:1.1rem; font-weight:800; color:#10B981;">${roiData.instrumentedCount} / ${roiData.totalStations} (${Math.round(roiData.instrumentedCount/roiData.totalStations*100)}%)</div>
          <div style="font-size:0.6rem; color:#aaa;">${roiData.currentRetrofitCount} IoT Retrofits Deployed</div>
        </div>
        <div class="validation-metric-card" style="text-align:center;">
          <div style="font-size:0.65rem; color:var(--text-muted);">DETECTION LEAD TIME</div>
          <div style="font-size:1.1rem; font-weight:800; color:#00E5FF;">${roiData.currentLeadTimeMin} min</div>
          <div style="font-size:0.6rem; color:#aaa;">Down from 14.5 min baseline</div>
        </div>
        <div class="validation-metric-card" style="text-align:center;">
          <div style="font-size:0.65rem; color:var(--text-muted);">FALSE ALARM RATE (FAR)</div>
          <div style="font-size:1.1rem; font-weight:800; color:#FFAB40;">${roiData.currentFarPct}%</div>
          <div style="font-size:0.6rem; color:#aaa;">System Trust: ${roiData.currentTrustScore}%</div>
        </div>
        <div class="validation-metric-card" style="text-align:center;">
          <div style="font-size:0.65rem; color:var(--text-muted);">SCRAP/WARRANTY SAVINGS</div>
          <div style="font-size:1.1rem; font-weight:800; color:#4FC3F7;">$${(roiData.annualSavings/1000).toFixed(0)}k / yr</div>
          <div style="font-size:0.6rem; color:#10B981;">Payback: ${roiData.paybackDays} Days</div>
        </div>
      `;
    }

    // 2. Projection Table
    const tbody = document.getElementById('sensor-roi-projection-tbody');
    if (tbody) {
      tbody.innerHTML = roiData.projections.map(p => {
        const isCurrent = p.isCurrent;
        const rowBg = isCurrent ? 'rgba(0, 229, 255, 0.12)' : 'transparent';
        const borderStyle = isCurrent ? 'border-left: 3px solid #00E5FF;' : '';
        return `
          <tr style="background:${rowBg}; ${borderStyle}">
            <td><strong>${p.retrofitCount === 0 ? 'Baseline (0 Retrofits)' : `+${p.retrofitCount} Retrofit Nodes (${p.retrofitCount === 11 ? 'Full Coverage' : 'Target Gaps'})`}</strong></td>
            <td style="color:#FFAB40; font-weight:700;">${p.sensorCost}</td>
            <td style="color:#00E5FF; font-weight:600;">${p.leadTimeMin}</td>
            <td style="color:${parseFloat(p.falseAlarmRate) < 3.5 ? '#10B981' : '#FFAB40'}; font-weight:600;">${p.falseAlarmRate}</td>
            <td>${p.systemTrust}</td>
            <td style="color:#10B981; font-weight:700;">${p.annualSavings}</td>
            <td style="color:#4FC3F7; font-weight:700;">${p.paybackPeriod}</td>
            <td>
              ${isCurrent 
                ? `<span class="badge-tag trusted" style="font-size:0.65rem; padding:2px 6px;">CURRENT STATE</span>` 
                : `<button style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:0.65rem; padding:2px 8px; border-radius:3px; cursor:pointer;" onclick="window.applyTargetRetrofitCount(${p.retrofitCount})">Simulate ➔</button>`}
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  function renderModellingStationDetail(station) {
    const panel = document.getElementById('modelling-station-detail');
    if (!panel) return;

    const profile = sim.getStationModellingProfile(station.id);
    const overallConf = Math.round(profile.overallConfidence * 100);
    const severity = window.dataGapEngine.classifyGapSeverity(station);
    
    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; flex-wrap:wrap; gap:0.5rem;">
        <div>
          <h4>${station.id} - ${station.name} (${station.equipment})</h4>
          <span style="font-size:0.75rem; color:#888;">Zone: ${station.zone} | Coverage: <strong class="status-pill-${severity}" style="text-transform:uppercase;">${station.sensorCoverage}</strong> | Latency: <strong>${station.detectionLatencyMin || (station.instrumented ? '0.2 min' : '14.5 min')}</strong></span>
        </div>
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <button style="background:${station.instrumented ? 'rgba(16,185,129,0.15)' : 'rgba(0,229,255,0.15)'}; border:1px solid ${station.instrumented ? '#10B981' : '#00E5FF'}; color:#fff; font-size:0.75rem; padding:4px 10px; border-radius:4px; cursor:pointer;" onclick="window.toggleStationInstrumentation('${station.id}')">
            ${station.instrumented ? '✓ Instrumented (Click to Remove)' : '⚡ Add IoT Sensor ($35)'}
          </button>
          <div style="text-align:right;">
            <div style="font-weight:700; font-size:1.1rem; color: #4FC3F7;">${overallConf}% Confidence</div>
            <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${station.instrumented ? 'Direct Telemetry' : 'Neighbor Inferred'}</span>
          </div>
        </div>
      </div>
      
      <div class="grid-2" style="margin-bottom: 1rem;">
        <div>
          <h5>Observability Parameters</h5>
          <table class="data-table" style="font-size: 0.75rem; width:100%; margin-top:0.5rem;">
            <thead>
              <tr>
                <th>Param</th>
                <th>Source</th>
                <th>Confidence</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              ${profile.parameters.map(p => {
                const confVal = Math.round(p.confidence * 100);
                const sourceColor = p.source === 'measured' ? '#10B981' : p.source === 'physics-inferred' ? '#29B6F6' : '#00E5FF';
                return `
                  <tr>
                    <td><strong>${p.name}</strong></td>
                    <td style="color:${sourceColor}">${p.source.toUpperCase()}</td>
                    <td>${confVal}%</td>
                    <td>${p.value ? p.value.toFixed(1) : 'N/A'} ${p.unit}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div>
          <h5>Active Sensors &amp; Hardware</h5>
          <ul style="list-style:none; padding:0; margin-top:0.5rem; font-size:0.8rem;">
            ${Object.entries(profile.sensors).map(([name, active]) => `
              <li style="display:flex; justify-content:space-between; padding:0.25rem 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span>${name.replace(/([A-Z])/g, ' $1').trim()}</span>
                <span class="${active ? 'status-pill-observed' : 'status-pill-unknown'}" style="font-size:0.7rem; padding: 2px 6px; border-radius:4px;">
                  ${active ? 'EQUIPPED' : 'MISSING'}
                </span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  function renderSensorCatalog() {
    const container = document.getElementById('low-cost-sensor-catalog-container');
    if (!container) return;

    const catalog = window.dataGapEngine.getLowCostSensorCatalog();
    container.innerHTML = catalog.map(s => {
      return `
        <div class="sensor-card glass-card" style="border: 1px solid rgba(255,255,255,0.05); padding:1rem; border-radius:8px; display:flex; flex-direction:column; justify-content:space-between;">
          <span class="cost-badge">$${s.cost}</span>
          <div>
            <h4 style="font-size: 0.95rem; margin-top: 0.5rem;">${s.type}</h4>
            <span class="difficulty-badge ${s.installDifficulty}">${s.installDifficulty.toUpperCase()} INSTALL</span>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0.5rem 0;">${s.description}</p>
            <span style="font-size: 0.75rem; color: #4FC3F7; display:block; margin-bottom:0.75rem;">Boosts confidence: +${Math.round(s.confidenceBoost * 100)}%</span>
          </div>
          <button class="deploy-btn ripple" data-sensor="${s.type}">Deploy Retrofit</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.deploy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sensorType = btn.dataset.sensor;
        const res = window.dataGapEngine.deploySensor(selectedStationId, sensorType);
        if (res.success) {
          showToast(res.message, 'success');
          const st = sim.stations.find(s => s.id === selectedStationId);
          if (st) {
            renderModellingStationDetail(st);
            renderStationDetailsAndEvidence(st);
          }
          renderModellingView();
        } else {
          showToast(res.reason, 'error');
        }
      });
    });
  }

  // ==========================================
  // 21. Predictive Techniques View
  // ==========================================
  function renderPredictiveView() {
    drawSPCCharts();
    drawCUSUMChart();
    drawEWMAChart();
    renderPhysicsModel();
    renderMLPrediction();
    renderValidationDashboard();
    renderAnomalyTimeline();
  }

  function drawSPCCharts() {
    const canvasX = document.getElementById('canvas-spc-xbar');
    const canvasR = document.getElementById('canvas-spc-range');
    const station = sim.stations.find(s => s.id === selectedStationId);
    if (!canvasX || !canvasR || !station) return;

    const res = predictiveEngine.getSPCAnalysis(sim.telemetryHistory, selectedStationId);
    if (!res) return;

    // --- 1. X-Bar Chart ---
    const ctxX = canvasX.getContext('2d');
    const wX = canvasX.width = canvasX.clientWidth;
    const hX = canvasX.height = 150;
    ctxX.clearRect(0, 0, wX, hX);

    ctxX.strokeStyle = 'rgba(255,255,255,0.05)';
    ctxX.lineWidth = 1;
    ctxX.beginPath();
    for (let x = 0; x < wX; x += 30) { ctxX.moveTo(x, 0); ctxX.lineTo(x, hX); }
    for (let y = 0; y < hX; y += 20) { ctxX.moveTo(0, y); ctxX.lineTo(wX, y); }
    ctxX.stroke();

    const minX = Math.min(...res.xbarData, res.lcl) * 0.98;
    const maxX = Math.max(...res.xbarData, res.ucl) * 1.02;
    const rangeX = maxX - minX || 1;
    const getX = (i, len) => (i / Math.max(1, len - 1)) * wX;
    const getYX = val => hX - ((val - minX) / rangeX) * hX;

    ctxX.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctxX.setLineDash([5, 5]);
    ctxX.beginPath();
    ctxX.moveTo(0, getYX(res.ucl)); ctxX.lineTo(wX, getYX(res.ucl));
    ctxX.moveTo(0, getYX(res.lcl)); ctxX.lineTo(wX, getYX(res.lcl));
    ctxX.stroke();

    ctxX.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctxX.setLineDash([]);
    ctxX.beginPath();
    ctxX.moveTo(0, getYX(res.cl)); ctxX.lineTo(wX, getYX(res.cl));
    ctxX.stroke();

    ctxX.strokeStyle = res.inControl ? '#10B981' : '#EF4444';
    ctxX.lineWidth = 2;
    ctxX.beginPath();
    for (let i = 0; i < res.xbarData.length; i++) {
      if (i === 0) ctxX.moveTo(getX(i, res.xbarData.length), getYX(res.xbarData[i]));
      else ctxX.lineTo(getX(i, res.xbarData.length), getYX(res.xbarData[i]));
    }
    ctxX.stroke();

    res.xbarData.forEach((d, i) => {
      const isViolating = res.violations.some(v => v.index === i);
      ctxX.fillStyle = isViolating ? '#EF4444' : '#fff';
      ctxX.beginPath();
      ctxX.arc(getX(i, res.xbarData.length), getYX(d), 3.5, 0, Math.PI * 2);
      ctxX.fill();
    });

    // --- 2. Range Chart ---
    const ctxR = canvasR.getContext('2d');
    const wR = canvasR.width = canvasR.clientWidth;
    const hR = canvasR.height = 100;
    ctxR.clearRect(0, 0, wR, hR);

    ctxR.strokeStyle = 'rgba(255,255,255,0.05)';
    ctxR.lineWidth = 1;
    ctxR.beginPath();
    for (let x = 0; x < wR; x += 30) { ctxR.moveTo(x, 0); ctxR.lineTo(x, hR); }
    for (let y = 0; y < hR; y += 20) { ctxR.moveTo(0, y); ctxR.lineTo(wR, y); }
    ctxR.stroke();

    if (res.rangeData.length > 0) {
      const minR = 0;
      const maxR = Math.max(...res.rangeData) * 1.2 || 1;
      const getYR = val => hR - ((val - minR) / maxR) * hR;

      ctxR.strokeStyle = '#80D8FF';
      ctxR.lineWidth = 1.5;
      ctxR.beginPath();
      for (let i = 0; i < res.rangeData.length; i++) {
        if (i === 0) ctxR.moveTo(getX(i, res.rangeData.length), getYR(res.rangeData[i]));
        else ctxR.lineTo(getX(i, res.rangeData.length), getYR(res.rangeData[i]));
      }
      ctxR.stroke();

      res.rangeData.forEach((d, i) => {
        ctxR.fillStyle = '#fff';
        ctxR.beginPath();
        ctxR.arc(getX(i, res.rangeData.length), getYR(d), 2.5, 0, Math.PI * 2);
        ctxR.fill();
      });
    }

    const cpkEl = document.getElementById('spc-cpk'); if (cpkEl) cpkEl.textContent = res.cpk.toFixed(2);
    const ppkEl = document.getElementById('spc-ppk'); if (ppkEl) ppkEl.textContent = res.ppk.toFixed(2);
    const inControlEl = document.getElementById('spc-in-control');
    if (inControlEl) {
      inControlEl.textContent = res.inControl ? 'In Control' : 'Out of Control';
      inControlEl.className = `badge-tag ${res.inControl ? 'in-control-badge' : 'out-control-badge'}`;
    }
    const violationsEl = document.getElementById('spc-violations-count');
    if (violationsEl) violationsEl.textContent = res.violations.length;

    // Update station badge
    const badge = document.getElementById('spc-station-badge');
    if (badge) badge.textContent = selectedStationId;
  }

  function drawCUSUMChart() {
    const canvas = document.getElementById('canvas-cusum');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 180;

    const res = predictiveEngine.getCUSUMAnalysis(sim.telemetryHistory, selectedStationId);
    if (!res) return;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const maxVal = Math.max(...res.cusumPlus, ...res.cusumMinus, res.threshold * 1.5, 1);
    const getY = val => h/2 - (val / maxVal) * (h/2 * 0.8);
    const getX = i => (i / Math.max(1, res.cusumPlus.length - 1)) * w;

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, h/2 - (res.threshold / maxVal) * (h/2 * 0.8));
    ctx.lineTo(w, h/2 - (res.threshold / maxVal) * (h/2 * 0.8));
    ctx.moveTo(0, h/2 + (res.threshold / maxVal) * (h/2 * 0.8));
    ctx.lineTo(w, h/2 + (res.threshold / maxVal) * (h/2 * 0.8));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

    ctx.strokeStyle = '#80D8FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < res.cusumPlus.length; i++) {
      const x = getX(i);
      const y = h/2 - (res.cusumPlus[i] / maxVal) * (h/2 * 0.8);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#29b6f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < res.cusumMinus.length; i++) {
      const x = getX(i);
      const y = h/2 + (res.cusumMinus[i] / maxVal) * (h/2 * 0.8);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#80D8FF';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('CUSUM+ (Upper)', 10, 15);
    ctx.fillStyle = '#29b6f6';
    ctx.fillText('CUSUM- (Lower)', 10, h - 10);

    const cusumBadge = document.getElementById('cusum-station-badge');
    if (cusumBadge) cusumBadge.textContent = selectedStationId;
  }

  function drawEWMAChart() {
    const canvas = document.getElementById('canvas-ewma');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 180;

    const res = predictiveEngine.getEWMAAnalysis(sim.telemetryHistory, selectedStationId);
    if (!res) return;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const allVals = [...res.ewmaData, ...res.ucl, ...res.lcl];
    const minVal = Math.min(...allVals) * 0.98;
    const maxVal = Math.max(...allVals) * 1.02;
    const range = maxVal - minVal || 1;

    const getX = i => (i / Math.max(1, res.ewmaData.length - 1)) * w;
    const getY = val => h - ((val - minVal) / range) * h;

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < res.ucl.length; i++) {
      if (i === 0) ctx.moveTo(getX(i), getY(res.ucl[i]));
      else ctx.lineTo(getX(i), getY(res.ucl[i]));
    }
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < res.lcl.length; i++) {
      if (i === 0) ctx.moveTo(getX(i), getY(res.lcl[i]));
      else ctx.lineTo(getX(i), getY(res.lcl[i]));
    }
    ctx.stroke();

    ctx.strokeStyle = res.isAnomaly ? '#FFAB40' : '#10B981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < res.ewmaData.length; i++) {
      if (i === 0) ctx.moveTo(getX(i), getY(res.ewmaData[i]));
      else ctx.lineTo(getX(i), getY(res.ewmaData[i]));
    }
    ctx.stroke();

    res.anomalyPoints.forEach(p => {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(getX(p.index), getY(p.value), 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(`λ = ${res.lambda.toFixed(2)}`, 10, 15);

    const ewmaBadge = document.getElementById('ewma-station-badge');
    if (ewmaBadge) ewmaBadge.textContent = selectedStationId;
  }

  function renderPhysicsModel() {
    const station = sim.stations.find(s => s.id === selectedStationId);
    if (!station) return;
    const pm = predictiveEngine.getPhysicsInformedModel(station);
    const d = document.getElementById('physics-model-display');
    if (d) {
      d.innerHTML = `
        <div class="term-line">Model: ${pm.modelName}</div>
        <div class="term-line eq">${pm.equation}</div>
        <div class="term-line" style="margin-top: 0.5rem; color:#888;">
          Inputs: ${pm.inputs.join(', ')}<br>
          Pred: ${pm.predictedValue.toFixed(2)} | Act: ${pm.actualValue.toFixed(2)} | Residual: ${pm.residual.toFixed(2)}
        </div>
      `;
    }

    const canvas = document.getElementById('physics-residual-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 100;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

    const hist = sim.telemetryHistory[station.id];
    if (hist && hist.torqueHistory.length > 0) {
      const residuals = hist.torqueHistory.map(t => t - pm.predictedValue);
      const maxRes = Math.max(...residuals.map(Math.abs), 2) * 1.2;
      const getX = i => (i / Math.max(1, residuals.length - 1)) * w;
      const getY = val => h/2 - (val / maxRes) * (h/2 * 0.8);

      ctx.strokeStyle = '#2979ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < residuals.length; i++) {
        if (i === 0) ctx.moveTo(getX(i), getY(residuals[i]));
        else ctx.lineTo(getX(i), getY(residuals[i]));
      }
      ctx.stroke();

      residuals.forEach((res, i) => {
        ctx.fillStyle = Math.abs(res) > (maxRes * 0.7) ? '#ef4444' : '#10b981';
        ctx.beginPath();
        ctx.arc(getX(i), getY(res), 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function renderMLPrediction() {
    const mlData = predictiveEngine.getMLBottleneckPrediction(sim.stations, sim.bottleneckTimeline);
    const defectData = sim.getDefectAnalytics ? sim.getDefectAnalytics() : null;
    const panel = document.getElementById('ml-prediction-panel');
    if (panel) {
      // Use high risk stations from Layer 2 if available, or ML predictions
      const highRisk = (defectData && defectData.highRiskStations && defectData.highRiskStations.length > 0)
        ? defectData.highRiskStations.slice(0, 5)
        : mlData.predictions.map(p => ({
            id: p.stationId,
            defectProbability: Math.round(p.probability * 100),
            stressScore: Math.round(p.probability * 80),
            dominantCause: 'Equipment Wear'
          }));

      panel.innerHTML = highRisk.map(p => {
        const pct = p.defectProbability || 0;
        const color = pct > 60 ? '#EF4444' : pct > 30 ? '#FFAB40' : '#10B981';
        return `
          <div class="prediction-card" style="margin-bottom: 0.6rem; padding: 0.5rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid ${color}; cursor:pointer;" onclick="window.selectStation('${p.id}', 'predml')">
            <div style="display:flex; justify-content:space-between; font-size:0.82rem;">
              <span class="station" style="font-weight:700; color:#fff;">${p.id} <span style="font-size:0.7rem; color:${color}; font-weight:600;">[P(Defect): ${pct}%]</span></span>
              <span style="font-size:0.7rem; color:#4FC3F7;">Cause: ${p.dominantCause || 'Process Stress'}</span>
            </div>
            <div class="prob-bar" style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden; margin-top:0.3rem;">
              <div class="fill" style="width: ${pct}%; height:100%; background: ${color};"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size: 0.68rem; color: rgba(255,255,255,0.5); margin-top:0.2rem;">
              <span>Stress Accrual: ${p.stressScore || 0}%</span>
              <span>Defects Caused: ${p.defectsInjected || 0}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    const impBox = document.getElementById('ml-feature-importance');
    if (impBox) {
      const features = [
        { feature: 'Process Stress & Queue', importance: 0.35, color: '#EF4444' },
        { feature: 'Equipment Degradation / RUL', importance: 0.28, color: '#FFAB40' },
        { feature: 'Cycle Time Deviation', importance: 0.18, color: '#00E5FF' },
        { feature: 'Environmental Factors', importance: 0.11, color: '#10B981' },
        { feature: 'Operator Fatigue / Shift', importance: 0.08, color: '#A855F7' }
      ];

      impBox.innerHTML = features.map(f => {
        const pct = Math.round(f.importance * 100);
        return `
          <div class="feature-bar" style="margin-bottom:0.45rem;">
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:0.15rem;">
              <span class="label" style="color:#ddd;">${f.feature}</span>
              <span style="font-weight:700; color:${f.color}; font-size:0.75rem;">${pct}%</span>
            </div>
            <div style="width:100%; height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
              <div class="bar-fill" style="width: ${pct}%; height:100%; background: ${f.color};"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  function updateConfidenceThreshold(val) {
    const tau = parseFloat(val) / 100;
    predictiveEngine.setConfidenceThreshold(tau);
    renderValidationDashboard();
    renderMLPrediction();
  }
  window.updateConfidenceThreshold = updateConfidenceThreshold;

  function submitSupervisorFeedback(alertId, stationId, isRealDefect) {
    predictiveEngine.recordSupervisorFeedback(alertId, stationId, isRealDefect);
    renderValidationDashboard();

    // Toast & live feed message
    showToast(isRealDefect ? `✓ Confirmed real defect on ${stationId}` : `✗ Marked false alarm on ${stationId} — Sensitivity recalibrated`, isRealDefect ? 'success' : 'warn');

    const list = document.getElementById('live-activity-feed-list');
    if (list) {
      const time = new Date().toLocaleTimeString();
      const li = document.createElement('li');
      li.className = 'feed-item';
      li.style.color = isRealDefect ? '#10B981' : '#FFAB40';
      li.style.borderLeft = isRealDefect ? '3px solid #10B981' : '3px solid #FFAB40';
      li.style.paddingLeft = '6px';
      li.innerHTML = `<strong>[${time}]</strong> 👨‍💼 <strong>SUPERVISOR CALIBRATION:</strong> Alert on ${stationId} marked as ${isRealDefect ? 'Real Defect (TP)' : 'False Alarm (FP)'} — station stress threshold updated.`;
      list.insertBefore(li, list.firstChild);
    }
  }
  window.submitSupervisorFeedback = submitSupervisorFeedback;

  function renderValidationDashboard() {
    const valData = predictiveEngine.getValidationDashboard();
    
    // 1. Update Threshold Slider & Badges
    const badge = document.getElementById('threshold-val-badge');
    if (badge) badge.textContent = `τ = ${valData.threshold}%`;

    const desc = document.getElementById('threshold-tradeoff-desc');
    if (desc) {
      const tau = valData.threshold;
      if (tau >= 70) {
        desc.innerHTML = `<span style="color:#10B981; font-weight:600;">High Precision Mode (τ = ${tau}%):</span> Suppresses false alarms (${valData.shadowModeResults.falseAlarmRate}% FAR). Ideal for high-speed automated lines with low operator tolerance for false stops.`;
      } else if (tau <= 30) {
        desc.innerHTML = `<span style="color:#EF4444; font-weight:600;">High Sensitivity Mode (τ = ${tau}%):</span> Maximizes defect recall (${valData.shadowModeResults.recall}% Recall). Catches critical defects early at the cost of higher false alarms (${valData.shadowModeResults.falseAlarmRate}% FAR).`;
      } else {
        desc.innerHTML = `<span style="color:#00E5FF; font-weight:600;">Balanced Calibration (τ = ${tau}%):</span> Optimal trade-off between Recall (${valData.shadowModeResults.recall}%) and Precision (${valData.shadowModeResults.precision}%). FAR at ${valData.shadowModeResults.falseAlarmRate}%.`;
      }
    }

    // 2. Metrics Grid
    const m = valData.shadowModeResults;
    const h = valData.holdoutMetrics;
    if (document.getElementById('val-acc')) document.getElementById('val-acc').textContent = `Acc: ${m.accuracy}%`;
    if (document.getElementById('val-prec')) document.getElementById('val-prec').textContent = `Prec: ${m.precision !== null ? m.precision + '%' : 'N/A'}`;
    if (document.getElementById('val-rec')) document.getElementById('val-rec').textContent = `Rec: ${m.recall !== null ? m.recall + '%' : 'N/A'}`;
    if (document.getElementById('val-f1')) document.getElementById('val-f1').textContent = `F1: ${m.f1 !== null ? m.f1 + '%' : 'N/A'}`;
    if (document.getElementById('val-far')) document.getElementById('val-far').textContent = `FAR: ${m.falseAlarmRate}%`;
    if (document.getElementById('val-mape')) document.getElementById('val-mape').textContent = `MAPE: ${parseFloat(h.mape).toFixed(1)}%`;
    if (document.getElementById('val-rmse')) document.getElementById('val-rmse').textContent = `RMSE: ${h.rmse}`;
    if (document.getElementById('val-r2')) document.getElementById('val-r2').textContent = `R²: ${h.r2}`;

    const trustLevelTag = document.getElementById('validation-trust-level');
    if (trustLevelTag) {
      trustLevelTag.textContent = valData.trustLevel.toUpperCase() + ' SYSTEM';
      trustLevelTag.className = `badge-tag ${valData.trustLevel === 'autonomous' || valData.trustLevel === 'trusted' ? 'trusted' : 'warning-badge'}`;
    }

    // 3. Live Confusion Matrix
    const cmBox = document.getElementById('predictive-confusion-matrix');
    if (cmBox) {
      const cm = valData.confusionMatrix;
      cmBox.innerHTML = `
        <div class="cm-cell tp" style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); border-radius:6px; padding:0.6rem; text-align:center;"><span class="cm-val" style="font-size:1.2rem; font-weight:800; color:#10B981;">${cm.tp}</span><div class="cm-label" style="font-size:0.65rem; color:#aaa; margin-top:2px;">True Positive (TP)</div><div style="font-size:0.55rem; color:#10B981;">Defect Caught</div></div>
        <div class="cm-cell fp" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:6px; padding:0.6rem; text-align:center;"><span class="cm-val" style="font-size:1.2rem; font-weight:800; color:#EF4444;">${cm.fp}</span><div class="cm-label" style="font-size:0.65rem; color:#aaa; margin-top:2px;">False Positive (FP)</div><div style="font-size:0.55rem; color:#EF4444;">False Alarm</div></div>
        <div class="cm-cell fn" style="background:rgba(255,171,64,0.12); border:1px solid rgba(255,171,64,0.3); border-radius:6px; padding:0.6rem; text-align:center;"><span class="cm-val" style="font-size:1.2rem; font-weight:800; color:#FFAB40;">${cm.fn}</span><div class="cm-label" style="font-size:0.65rem; color:#aaa; margin-top:2px;">False Negative (FN)</div><div style="font-size:0.55rem; color:#FFAB40;">Missed Defect</div></div>
        <div class="cm-cell tn" style="background:rgba(0,229,255,0.12); border:1px solid rgba(0,229,255,0.3); border-radius:6px; padding:0.6rem; text-align:center;"><span class="cm-val" style="font-size:1.2rem; font-weight:800; color:#00E5FF;">${cm.tn}</span><div class="cm-label" style="font-size:0.65rem; color:#aaa; margin-top:2px;">True Negative (TN)</div><div style="font-size:0.55rem; color:#00E5FF;">Clean Verified</div></div>
      `;
    }

    // 4. Model Comparison Table
    const compBox = document.getElementById('validation-model-comparison-table-container');
    if (compBox) {
      compBox.innerHTML = `
        <table class="data-table" style="font-size: 0.8rem; width: 100%;">
          <thead>
            <tr>
              <th>Model</th>
              <th>Sens.</th>
              <th>Spec.</th>
              <th>Latency</th>
              <th>Strengths / Bounds</th>
            </tr>
          </thead>
          <tbody>
            ${valData.modelComparison.map(m => `
              <tr>
                <td><strong>${m.model}</strong></td>
                <td><span style="color:#10B981; font-weight:600;">${(m.sensitivity*100).toFixed(0)}%</span></td>
                <td><span style="color:#00E5FF; font-weight:600;">${(m.specificity*100).toFixed(0)}%</span></td>
                <td>${m.detectionLatency}</td>
                <td style="font-size:0.72rem; color:var(--text-muted);">${m.bestFor}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // 5. Trust Badge
    const trustBadge = document.getElementById('validation-trust-level');
    if (trustBadge) {
      const label = valData.trustLevel.toUpperCase();
      trustBadge.textContent = `${label} SYSTEM`;
      trustBadge.className = `badge-tag ${valData.trustLevel === 'autonomous' ? 'trusted' : valData.trustLevel === 'trusted' ? 'trusted' : valData.trustLevel === 'probation' ? 'warn' : 'alert'}`;
    }

    // 6. Supervisor Action / Feedback List
    const supervisorBox = document.getElementById('supervisor-action-list');
    if (supervisorBox) {
      const anomalies = predictiveEngine.getAnomalyTimeline().slice(0, 4);
      supervisorBox.innerHTML = anomalies.map((a, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.4rem 0.6rem; border-radius:6px; border:1px solid rgba(255,255,255,0.05); font-size:0.75rem;">
          <div>
            <span style="font-weight:700; color:#fff;">${a.stationId}</span>
            <span style="color:#aaa; margin-left:0.35rem;">${a.description}</span>
            <span style="font-size:0.65rem; color:#00E5FF; margin-left:0.35rem;">[${a.detectedBy} · ${(a.confidence*100).toFixed(0)}% Conf]</span>
          </div>
          <div style="display:flex; gap:0.3rem;">
            <button style="background:rgba(16,185,129,0.2); border:1px solid #10B981; color:#10B981; font-size:0.65rem; padding:2px 8px; border-radius:4px; cursor:pointer;" onclick="window.submitSupervisorFeedback('ALT-${idx}', '${a.stationId}', true)">
              ✓ Real Defect
            </button>
            <button style="background:rgba(239,68,68,0.2); border:1px solid #EF4444; color:#EF4444; font-size:0.65rem; padding:2px 8px; border-radius:4px; cursor:pointer;" onclick="window.submitSupervisorFeedback('ALT-${idx}', '${a.stationId}', false)">
              ✗ False Alarm
            </button>
          </div>
        </div>
      `).join('');
    }

    // 7. Validation History Log
    const historyList = document.getElementById('validation-history-list');
    if (historyList) {
      historyList.innerHTML = valData.validationHistory.slice(-5).map(h => `
        <li style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; padding: 0.3rem 0; border-bottom:1px solid rgba(255,255,255,0.03);">
          <span>[${h.timestamp}] <strong>${h.stationId}</strong> (${h.model}): Pred <strong>${h.predicted}</strong> vs Ground-Truth <strong>${h.actual}</strong> <span style="color:var(--text-muted); font-size:0.65rem;">(${h.confidence})</span></span>
          <span class="${h.correct ? 'status-pill-observed' : 'status-pill-conflicting'}" style="padding: 2px 6px; border-radius:4px; font-size:0.65rem; font-weight:700;">
            ${h.type}: ${h.correct ? 'VERIFIED' : 'ERROR'}
          </span>
        </li>
      `).join('');
    }
  }

  function renderAnomalyTimeline() {
    const container = document.getElementById('anomaly-timeline-container');
    if (!container) return;

    const anomalies = predictiveEngine.getAnomalyTimeline();
    container.innerHTML = `
      <div style="position:relative; height:4px; background:rgba(255,255,255,0.1); margin: 2rem 0; border-radius:2px; width:100%;">
        ${anomalies.map((a, i) => {
          const leftPct = 10 + (i / (anomalies.length - 1)) * 80;
          const color = a.severity === 'critical' ? '#EF4444' : a.severity === 'high' ? '#FFAB40' : '#3B82F6';
          return `
            <div class="anomaly-dot" style="position:absolute; left:${leftPct}%; top:-5px; width:14px; height:14px; background:${color}; border-radius:50%; border: 3px solid var(--bg-dark); cursor:pointer; box-shadow: 0 0 8px ${color};" title="${a.stationId}: ${a.description}">
              <div class="anomaly-tooltip" style="display:none; position:absolute; bottom:25px; left:50%; transform:translateX(-50%); background:rgba(15,10,35,0.95); border: 1px solid ${color}; padding:0.5rem; border-radius:6px; min-width:180px; z-index:20; font-size:0.75rem; color:#fff;">
                <strong>${a.stationId} (${a.detectedBy})</strong><br>
                ${a.description}<br>
                <span style="color:#aaa;">Conf: ${(a.confidence*100).toFixed(0)}%</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('.anomaly-dot').forEach(dot => {
      dot.addEventListener('mouseenter', () => {
        dot.querySelector('.anomaly-tooltip').style.display = 'block';
      });
      dot.addEventListener('mouseleave', () => {
        dot.querySelector('.anomaly-tooltip').style.display = 'none';
      });
    });
  }

  // ==========================================
  // 21b. Multi-Line Instancing & Switcher (Layer 6)
  // ==========================================
  function handleLineSwitch(lineId) {
    const targetEngine = window.switchSimulationLine(lineId);
    if (!targetEngine) return;
    sim = targetEngine;

    const sel = document.getElementById('select-line-instance');
    if (sel) sel.value = lineId;

    selectedStationId = sim.stations[0]?.id || 'S1';
    selectedVinId = sim.vehicles[0]?.vin || null;

    showToast(`🏭 Switched to ${targetEngine.config.name} (${targetEngine.stations.length} stations, ${targetEngine.config.plant})`, 'info');

    // Notify activity feed
    const list = document.getElementById('live-activity-feed-list');
    if (list) {
      const time = new Date().toLocaleTimeString();
      const li = document.createElement('li');
      li.className = 'feed-item';
      li.style.color = '#00E5FF';
      li.style.borderLeft = '3px solid #00E5FF';
      li.style.paddingLeft = '6px';
      li.innerHTML = `<strong>[${time}]</strong> 🌐 <strong>LINE INSTANCE ACTIVATED:</strong> Loaded ${targetEngine.config.name} (${targetEngine.config.plant}) — ${targetEngine.stations.length} stations, ${targetEngine.config.instrumentedPercent}% instrumented baseline.`;
      list.insertBefore(li, list.firstChild);
    }

    createStationNodeElements();
    updateDynamicUI();
    const st = sim.stations.find(s => s.id === selectedStationId);
    if (st) renderStationDetailsAndEvidence(st);
    renderModellingView();
    renderPredictiveView();
    renderManagerView();
    drawMiniMap();
  }
  window.handleLineSwitch = handleLineSwitch;

  function renderMultiLineComparison() {
    const lines = window.getAllLinesComparison();
    if (!lines || lines.length === 0) return;

    const cardsBox = document.getElementById('multi-line-health-cards-container');
    if (cardsBox) {
      cardsBox.innerHTML = lines.map(line => {
        const isActive = (line.lineId === window.activeLineId);
        const thiColor = line.thi >= 90 ? '#10B981' : line.thi >= 80 ? '#00E5FF' : line.thi >= 70 ? '#FFAB40' : '#EF4444';
        return `
          <div class="glass-card" style="padding:1rem; border-radius:8px; border:${isActive ? '2px solid #00E5FF' : '1px solid rgba(255,255,255,0.08)'}; background:${isActive ? 'rgba(0,229,255,0.05)' : 'rgba(255,255,255,0.02)'}; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <h4 style="font-size:0.95rem; margin-bottom:0.15rem; color:#fff;">${line.lineName}</h4>
                  <span style="font-size:0.7rem; color:var(--text-muted);">${line.plant} · ${line.stationCount} Stations</span>
                </div>
                ${isActive ? `<span class="badge-tag trusted" style="font-size:0.6rem; padding:2px 6px;">ACTIVE TWIN</span>` : ''}
              </div>

              <div style="display:flex; align-items:baseline; gap:0.5rem; margin:0.75rem 0 0.35rem 0;">
                <span style="font-size:1.8rem; font-weight:800; color:${thiColor};">${line.thi}</span>
                <span style="font-size:0.75rem; color:var(--text-muted);">/ 100 THI (${line.healthTier})</span>
              </div>
              <div style="width:100%; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-bottom:0.75rem;">
                <div style="width:${line.thi}%; height:100%; background:${thiColor};"></div>
              </div>

              <div style="font-size:0.72rem; color:var(--text-muted); display:flex; flex-direction:column; gap:0.25rem;">
                <div style="display:flex; justify-content:space-between;">
                  <span>Throughput Efficiency:</span>
                  <strong style="color:#fff;">${line.components.throughputEfficiency}% (${line.jph}/${line.targetJph} JPH)</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Quality Yield:</span>
                  <strong style="color:#10B981;">${line.components.qualityYield}%</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Sensor IoT Coverage:</span>
                  <strong style="color:#00E5FF;">${line.components.sensorCoveragePct}% (${line.instrumentedCount}/${line.stationCount})</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Flow Stability:</span>
                  <strong style="color:#FFAB40;">${line.components.flowStability}%</strong>
                </div>
              </div>
            </div>

            <button style="margin-top:1rem; width:100%; background:${isActive ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${isActive ? '#00E5FF' : 'rgba(255,255,255,0.15)'}; color:#fff; font-size:0.75rem; padding:6px; border-radius:4px; cursor:pointer;" onclick="window.handleLineSwitch('${line.lineId}')">
              ${isActive ? '● Currently Active' : 'Switch to this Line ➔'}
            </button>
          </div>
        `;
      }).join('');
    }

    const tbody = document.getElementById('multi-line-comparison-tbody');
    if (tbody) {
      tbody.innerHTML = lines.map(line => {
        const isActive = (line.lineId === window.activeLineId);
        const thiColor = line.thi >= 90 ? '#10B981' : line.thi >= 80 ? '#00E5FF' : line.thi >= 70 ? '#FFAB40' : '#EF4444';
        return `
          <tr style="background:${isActive ? 'rgba(0,229,255,0.1)' : 'transparent'}; ${isActive ? 'border-left:3px solid #00E5FF;' : ''}">
            <td><strong>${line.lineName}</strong><br><span style="font-size:0.68rem; color:var(--text-muted);">${line.plant}</span></td>
            <td>${line.stationCount} Stns</td>
            <td><span style="color:#00E5FF; font-weight:700;">${line.components.sensorCoveragePct}%</span> (${line.instrumentedCount}/${line.stationCount})</td>
            <td>${line.targetJph} JPH</td>
            <td><strong style="color:#fff;">${line.jph} JPH</strong></td>
            <td><strong style="color:#10B981;">${line.components.qualityYield}%</strong></td>
            <td><strong style="color:${thiColor}; font-size:0.95rem;">${line.thi}</strong> <span style="font-size:0.65rem; color:var(--text-muted);">/ 100</span></td>
            <td><span class="badge-tag ${line.thi >= 85 ? 'trusted' : line.thi >= 75 ? 'warn' : 'alert'}" style="font-size:0.65rem;">${line.healthTier}</span></td>
            <td>
              ${isActive 
                ? `<span style="font-size:0.7rem; color:#00E5FF; font-weight:700;">ACTIVE</span>` 
                : `<button style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:0.7rem; padding:2px 8px; border-radius:3px; cursor:pointer;" onclick="window.handleLineSwitch('${line.lineId}')">Inspect ➔</button>`}
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // ==========================================
  // 21c. Leadership View (Layer 7)
  // ==========================================
  function renderLeadershipView() {
    const roi = sim.getSensorRoiTradeoffTable();
    const thiObj = sim.getTwinHealthScore();

    const savingsTicker = document.getElementById('exec-savings-ticker');
    if (savingsTicker) {
      const totalSavings = 482400 + Math.round(accumulativeFinancialLoss) + (roi.annualSavings || 0);
      savingsTicker.textContent = `$${totalSavings.toLocaleString()}`;
    }

    const capexEl = document.getElementById('exec-capex-val');
    if (capexEl) {
      capexEl.textContent = `$${roi.currentInvestment || 385}`;
    }

    const paybackEl = document.getElementById('exec-payback-val');
    if (paybackEl) {
      paybackEl.textContent = `${roi.paybackDays || '0.5'} Days`;
    }

    const thiEl = document.getElementById('exec-thi-val');
    if (thiEl) {
      thiEl.textContent = `${thiObj.thi} THI`;
    }

    renderMultiLineComparison();
  }

  // ==========================================
  // 22. Manager View
  // ==========================================
  function renderManagerView() {
    const container = document.getElementById('sensor-coverage-matrix');
    if (!container) return;

    container.innerHTML = sim.stations.map(s => {
      const avgConf = Math.round(Object.values(s.signalConfidence).reduce((a, b) => a + b, 0) / 5 * 100);
      const isSel = s.id === selectedStationId;
      let border = isSel ? '2px solid #00E5FF' : '1px solid rgba(255,255,255,0.05)';
      let bg = isSel ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255,255,255,0.02)';
      if (s.isBottleneck) {
        border = isSel ? '2px solid #FF6B6B' : '1px solid #EF4444';
        bg = isSel ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';
      }
      
      return `
        <div class="sensor-matrix-cell" data-sid="${s.id}" style="border:${border}; background:${bg}; border-radius:6px; padding:0.5rem; text-align:center; cursor:pointer; transition: all 0.2s ease;">
          <span style="font-size:0.75rem; font-weight:700; color:${isSel ? '#00E5FF' : '#fff'};">${s.id}</span>
          <div style="display:flex; justify-content:center; gap:2px; margin-top:0.25rem;">
            <div style="width:5px; height:5px; border-radius:50%; background:${s.sensors.torqueSensor ? '#10B981' : '#475569'};" title="Torque"></div>
            <div style="width:5px; height:5px; border-radius:50%; background:${s.sensors.accelerometer ? '#10B981' : '#475569'};" title="Vibration"></div>
            <div style="width:5px; height:5px; border-radius:50%; background:${s.sensors.thermocouple ? '#10B981' : '#475569'};" title="Temp"></div>
            <div style="width:5px; height:5px; border-radius:50%; background:${s.sensors.opticalProximity ? '#10B981' : '#475569'};" title="Cycle Time"></div>
          </div>
          <span style="font-size:0.65rem; color:#888; display:block; margin-top:0.25rem;">${avgConf}%</span>
        </div>
      `;
    }).join('');

    // Click handler for sensor matrix cells
    container.querySelectorAll('.sensor-matrix-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        selectStation(cell.dataset.sid, 'sensor-matrix');
        renderManagerView();
      });
    });
  }

  let selectedHeatmapParam = 'torque';
  function renderHeatmap() {
    const container = document.getElementById('station-heatmap');
    if (!container) return;

    let html = `
      <div style="grid-column: span 10; display:flex; gap:0.5rem; margin-bottom: 0.5rem; justify-content:space-between; align-items:center;">
        <span style="font-size:0.8rem; color:#aaa;">Param:</span>
        <select id="heatmap-param-select" class="glass-card" style="font-size:0.75rem; padding:0.25rem 0.5rem; border:1px solid rgba(255,255,255,0.1); background:#111; color:#fff;">
          <option value="torque" ${selectedHeatmapParam === 'torque' ? 'selected' : ''}>Torque</option>
          <option value="temperature" ${selectedHeatmapParam === 'temperature' ? 'selected' : ''}>Temperature</option>
          <option value="vibration" ${selectedHeatmapParam === 'vibration' ? 'selected' : ''}>Vibration</option>
          <option value="cycleTime" ${selectedHeatmapParam === 'cycleTime' ? 'selected' : ''}>Cycle Time</option>
        </select>
      </div>
    `;

    sim.stations.forEach(s => {
      const source = s.paramSources[selectedHeatmapParam];
      let methodClass = 'fleet';
      if (source === 'measured' || source === 'real-sensor') methodClass = 'measured';
      else if (source === 'physics-inferred' || source === 'physics-model') methodClass = 'physics';
      else if (source === 'neighbor-interpolated' || source === 'neighbor-interpolation') methodClass = 'interpolated';

      html += `
        <div class="heatmap-cell ${methodClass} ${s.id === selectedStationId ? 'selected' : ''}" data-id="${s.id}" title="${s.id}: ${source.toUpperCase()}">
          <span style="position:absolute; font-size:9px; top:2px; left:4px; font-weight:700; color:#fff;">${s.id}</span>
          <span style="position:absolute; bottom:2px; right:4px; font-size:8px; color:rgba(255,255,255,0.7);">
            ${Math.round(s.signalConfidence[selectedHeatmapParam]*100)}
          </span>
        </div>
      `;
    });

    container.innerHTML = html;

    const sel = document.getElementById('heatmap-param-select');
    if (sel) {
      sel.addEventListener('change', (e) => {
        selectedHeatmapParam = e.target.value;
        renderHeatmap();
      });
    }

    container.querySelectorAll('.heatmap-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        selectStation(cell.dataset.id, 'heatmap');
        renderHeatmap();
        const stObj = sim.stations.find(s => s.id === selectedStationId);
        if (stObj) renderModellingStationDetail(stObj);
      });
    });
  }

  function drawRadarChart() {
    const canvas = document.getElementById('canvas-radar-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 300;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) * 0.7;

    const labels = ['Throughput', 'Quality', 'Availability', 'Data Integrity', 'Maintenance'];
    const summary = sim.getSummaryMetrics();
    const data = [
      summary.throughputRate / 50,
      0.95,
      summary.oee / 0.9,
      summary.trustScore / 100,
      0.88
    ];

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let level = 1; level <= 5; level++) {
      const radius = r * (level / 5);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px Inter';
      ctx.textAlign = 'center';
      const labelX = cx + Math.cos(angle) * (r + 15);
      const labelY = cy + Math.sin(angle) * (r + 15);
      ctx.fillText(labels[i], labelX, labelY);
    }

    ctx.strokeStyle = '#80D8FF';
    ctx.fillStyle = 'rgba(192, 132, 252, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
      const radius = r * Math.min(1.0, data[i]);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
  
  function drawBottleneckMigration() {
    const canvas = document.getElementById('canvas-bottleneck-migration');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 200;
    
    ctx.clearRect(0,0,w,h);

    const labelW = 28; // left margin for station labels
    const plotW = w - labelW;
    const cw = plotW / 200;
    const ch = h / 35;

    // Selected station highlight row
    const selIdx = parseInt(selectedStationId.replace('S','')) - 1;
    if (selIdx >= 0 && selIdx < 35) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.06)';
      ctx.fillRect(labelW, selIdx * ch, plotW, ch);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(labelW, selIdx * ch, plotW, ch);
    }
    
    // Bottleneck heat cells
    bottleneckHistory.forEach((btnkId, xIdx) => {
      if(!btnkId) return;
      const sIdx = parseInt(btnkId.replace('S','')) - 1;
      const isSelRow = sIdx === selIdx;
      ctx.fillStyle = isSelRow ? 'rgba(255, 100, 100, 1)' : 'rgba(239, 68, 68, 0.8)';
      ctx.fillRect(labelW + xIdx * cw, sIdx * ch, cw + 0.5, ch);
    });

    // Y-axis station labels (every 5th)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '600 7px Inter';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 35; i += 5) {
      ctx.fillStyle = i === selIdx ? '#00E5FF' : 'rgba(255,255,255,0.35)';
      ctx.fillText(`S${i+1}`, labelW - 3, i * ch + ch / 2);
    }
    // Always show selected station label
    if (selIdx % 5 !== 0) {
      ctx.fillStyle = '#00E5FF';
      ctx.fillText(`S${selIdx+1}`, labelW - 3, selIdx * ch + ch / 2);
    }

    // Click handler (attach once)
    if (!canvas._migClickBound) {
      canvas.addEventListener('click', (evt) => {
        const rect = canvas.getBoundingClientRect();
        const my = (evt.clientY - rect.top) * (h / rect.height);
        const stIdx = Math.floor(my / ch);
        if (stIdx >= 0 && stIdx < 35) {
          selectStation(`S${stIdx + 1}`, 'migration');
        }
      });
      canvas._migClickBound = true;
    }
  }

  function renderMaintenanceTable() {
    const tbody = document.querySelector('#predictive-maintenance-table tbody');
    if (!tbody) return;

    const sorted = [...sim.stations].sort((a, b) => a.rul.hoursRemaining - b.rul.hoursRemaining).slice(0, 5);

    tbody.innerHTML = sorted.map(st => {
      const rulHours = Math.round(st.rul.hoursRemaining);
      const rulPct = Math.max(5, Math.min(100, (rulHours / 8000) * 100));
      const urgency = rulHours < 100 ? 'High Risk' : rulHours < 500 ? 'Medium Risk' : 'Normal';
      const badgeClass = rulHours < 100 ? 'high' : rulHours < 500 ? 'warn' : 'normal';
      const color = rulHours < 100 ? '#EF4444' : rulHours < 500 ? '#FFAB40' : '#10B981';

      const isSel = st.id === selectedStationId;
      return `
        <tr class="maint-row" data-sid="${st.id}" style="cursor:pointer; ${isSel ? 'background:rgba(0,229,255,0.08);' : ''}">
          <td><strong style="color:${isSel ? '#00E5FF' : '#fff'};">${st.id}</strong></td>
          <td>${equipmentLabel(st.equipment)}</td>
          <td>
            <div class="rul-bar" title="${rulHours} hours remaining">
              <div class="fill" style="width:${rulPct}%; background:${color};"></div>
            </div>
            <span style="font-size:0.75rem; color:#aaa;">${rulHours}h remaining</span>
          </td>
          <td><span class="urgency-badge ${badgeClass}" style="color:${color}; background:rgba(${rulHours < 100 ? '239,68,68' : '245,158,11'},0.15); padding:2px 6px; border-radius:4px; font-size:0.75rem;">${urgency}</span></td>
          <td><button class="btn ripple btn-sm" onclick="event.stopPropagation(); alert('Maintenance ticket created for ${st.id}')" style="font-size:0.75rem; padding:0.25rem 0.5rem; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:4px; cursor:pointer;">Schedule</button></td>
        </tr>
      `;
    }).join('');

    // Click handler for maintenance rows
    tbody.querySelectorAll('.maint-row').forEach(row => {
      row.addEventListener('click', () => {
        selectStation(row.dataset.sid, 'maintenance');
        renderMaintenanceTable();
      });
    });
  }

  // ==========================================
  // Misc Init Functions
  // ==========================================
  function updateLiveIndicator() {
    const liveEl = document.getElementById('mini-map-live-indicator');
    if (!liveEl) return;
    if (isSimPaused) {
      liveEl.textContent = '● OFFLINE';
      liveEl.classList.add('is-offline');
    } else {
      liveEl.textContent = '● LIVE';
      liveEl.classList.remove('is-offline');
    }
  }

  function initSimulationControls() {
    const playPauseBtn = document.getElementById('btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        isSimPaused = !isSimPaused;
        playPauseBtn.textContent = isSimPaused ? '▶' : '⏸';
        updateLiveIndicator();
        showToast(isSimPaused ? 'Simulation paused' : 'Simulation resumed', 'info');
      });
    }

    const stepBtn = document.getElementById('btn-step');
    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        sim.updateContinuous(1.0);
        updateDynamicUI();
        showToast('Stepped simulation +1s', 'info');
      });
    }

    const speedSelect = document.getElementById('select-speed');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        showToast(`Simulation speed set to ${val}x`, 'info');
      });
    }

    const scenarioSelect = document.getElementById('select-scenario');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'normal') {
          sim.setScenario(null);
          showToast('Normal operations restored', 'success');
        } else if (val === 's1') {
          sim.setScenario('scenario-1');
          showToast('⚠ Scenario 1: Loose bolt detected at S4 — torque drift causing slowdown. Approve Action to resolve.', 'warning');
        } else if (val === 's2') {
          sim.setScenario('scenario-2');
          showToast('⚠ Scenario 2: Oven overheating at S16 — safety throttle engaged. Approve Action to resolve.', 'warning');
        } else if (val === 's3') {
          sim.setScenario('scenario-3');
          showToast('⚠ Scenario 3: Sensor data stale at S12 — controller running blind. Approve Action to resolve.', 'warning');
        } else if (val === 's4') {
          sim.setScenario('scenario-4');
          showToast('⚠ Scenario 4: Conveyor jam at S22 — mechanical fault detected. Approve Action to resolve.', 'warning');
        } else if (val === 's5') {
          sim.setScenario('scenario-5');
          showToast('⚠ Scenario 5: Robot arm failure at S8 — servo error, extreme slowdown. Approve Action to resolve.', 'warning');
        }
      });
    }
  }

  function initRoiCalculator() {
    const btn = document.getElementById('btn-calc-roi');
    if (!btn) return;

    btn.addEventListener('click', () => {
      // Benchmark Assumptions: $15k pilot budget, $45 avg automotive warranty defect claim (Warranty Week benchmark), 250k annual JPH production capacity
      const budget = parseFloat(document.getElementById('roi-budget').value || 15000);
      const defectCost = parseFloat(document.getElementById('roi-defect-cost').value || 45);
      const units = parseFloat(document.getElementById('roi-units').value || 250000);

      const summary = sim.getExplicitVsInferredSummary();
      const coveragePct = summary.sensorCoveragePercent / 100;
      
      const confidenceGain = 0.90 - (0.45 * (1 - coveragePct));
      const probReduction = 0.005; // 0.5% absolute defect escape prevention
      
      const annualSavings = confidenceGain * defectCost * units * probReduction;
      const paybackMonths = (budget / annualSavings) * 12;
      const roiPct = ((annualSavings - budget) / budget) * 100;

      const savingsEl = document.getElementById('roi-savings');
      if (savingsEl) savingsEl.textContent = `$${(annualSavings / 1000).toFixed(0)}k/yr`;
      
      const paybackEl = document.getElementById('roi-payback');
      if (paybackEl) paybackEl.textContent = `${Math.ceil(paybackMonths)} Months`;
      
      const oeeUpliftEl = document.getElementById('roi-oee-uplift');
      if (oeeUpliftEl) oeeUpliftEl.textContent = `+${(confidenceGain * 4.5).toFixed(1)}%`;

      const results = document.getElementById('roi-calculator-results');
      if (results) {
        results.style.display = 'block';
        results.innerHTML = `
          <div style="margin-bottom:0.5rem; font-weight:700; color:#fff;">Analysis Results:</div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
            <span>Est. Defect Reduction:</span>
            <span style="color:#10B981; font-weight:600;">-${(probReduction * 100).toFixed(2)}%</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
            <span>Projected Annual Savings:</span>
            <span style="color:#10B981; font-weight:600;">$${annualSavings.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
            <span>Payback Period:</span>
            <span style="color:#ffab40; font-weight:600;">${paybackMonths.toFixed(1)} Months</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>1-Year Net ROI:</span>
            <span style="color:#10B981; font-weight:600;">${roiPct.toFixed(0)}%</span>
          </div>
        `;
      }
    });

    btn.click();
  }

  function initKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
      if(e.key === ' ') { 
        isSimPaused = !isSimPaused;
        const playPauseBtn = document.getElementById('btn-play-pause');
        if (playPauseBtn) playPauseBtn.textContent = isSimPaused ? '▶' : '⏸';
        updateLiveIndicator();
        e.preventDefault(); 
      }
      if(e.key >= '1' && e.key <= '5') {
        const tabs = ['supervisor', 'manager', 'leadership', 'modelling', 'predictive'];
        switchTab(tabs[parseInt(e.key)-1]);
      }
    });
  }

  function initContextMenu() {
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    window.addEventListener('click', () => {
      menu.style.display = 'none';
    });

    const strip = document.getElementById('stations-strip');
    if (strip) {
      strip.addEventListener('contextmenu', (e) => {
        const seg = e.target.closest('.station-node');
        if (seg) {
          e.preventDefault();
          contextMenuStationId = seg.dataset.id;
          menu.style.display = 'block';
          menu.style.left = `${e.clientX}px`;
          menu.style.top = `${e.clientY}px`;
        }
      });
    }

    menu.querySelectorAll('.ctx-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.textContent.trim();
        if (action === 'View Details') {
          const st = sim.stations.find(s => s.id === contextMenuStationId);
          if (st) {
            selectedStationId = contextMenuStationId;
            document.getElementById(`node-${selectedStationId}`)?.click();
          }
        } else if (action === 'Deploy Sensor') {
          const res = window.dataGapEngine.deploySensor(contextMenuStationId, 'Piezo Vibration Sensor');
          if (res.success) {
            showToast(res.message, 'success');
            renderModellingView();
            const st = sim.stations.find(s => s.id === contextMenuStationId);
            if (st) renderStationDetailsAndEvidence(st);
          } else {
            showToast(res.reason, 'error');
          }
        } else if (action === 'Mark Maintenance') {
          const st = sim.stations.find(s => s.id === contextMenuStationId);
          if (st) {
            st.rul.hoursRemaining = 8000;
            showToast(`Maintenance performed on ${contextMenuStationId}. Wear reset.`, 'success');
            renderMaintenanceTable();
          }
        } else if (action === 'Run What-If') {
          switchTab('supervisor');
          const btn = document.getElementById('btn-run-simulation');
          btn?.click();
        }
      });
    });
  }

  function init3DNodeTilt() {
    // Only apply subtle tilt to small individual stat cards, never to hero banner or major container layouts
    document.querySelectorAll('.stat-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xc = rect.width / 2;
        const yc = rect.height / 2;
        const angleX = (yc - y) / yc * 2.5;
        const angleY = (x - xc) / xc * 2.5;
        card.style.transform = `perspective(800px) rotateX(${angleX}deg) rotateY(${angleY}deg) translateY(-2px)`;
        card.style.transition = 'none';
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'none';
        card.style.transition = 'transform 0.4s ease';
      });
    });
  }

  function initFooterTicker() {
    const track = document.getElementById('ticker-track');
    if (!track) return;

    setInterval(() => {
      const summary = sim.getSummaryMetrics();
      let text = `🟢 Systems fully operational • Total WIP: ${summary.totalWip} • OEE: ${(summary.oee*100).toFixed(1)}%`;
      if (summary.activeBottleneck) {
        text = `🔴 BOTTLENECK DETECTED AT ${summary.activeBottleneck} • System Trust: ${summary.trustScore}% • Action recommended`;
      } else if (summary.predictedBottlenecks && summary.predictedBottlenecks.length > 0) {
        const predStr = summary.predictedBottlenecks.map(p => `${p.id} (~${p.eta}m)`).join(', ');
        text = `🟡 PREDICTED BOTTLENECK AT ${predStr} • Running Monte Carlo analysis`;
      }
      track.innerHTML = `<span>${text}</span> • <span>Shift: ${sim.shiftState.name} (Fatg: ${(sim.shiftState.fatigueLevel*100).toFixed(0)}%)</span> • <span>Temp: ${sim.environment.ambientTemp.toFixed(1)}°C</span>`;
    }, 2000);
  }

  function initActivityFeed() {
    const list = document.getElementById('live-activity-feed-list');
    if (!list) return;

    let lastSurfacedCount = 0;

    setInterval(() => {
      if (isSimPaused) return;

      const defectAnalytics = sim.getDefectAnalytics ? sim.getDefectAnalytics() : null;
      const surfaced = defectAnalytics?.recentSurfaced || [];
      const time = new Date().toLocaleTimeString();
      const li = document.createElement('li');
      li.className = 'feed-item';

      if (surfaced.length > 0 && surfaced.length !== lastSurfacedCount) {
        lastSurfacedCount = surfaced.length;
        const latest = surfaced[0];
        li.style.color = '#EF4444';
        li.style.borderLeft = '3px solid #EF4444';
        li.style.paddingLeft = '6px';
        li.innerHTML = `<strong>[${time}]</strong> 🚩 <strong>INSPECTION ALERT:</strong> Gate ${latest.surfacedAt || 'S20'} detected <em>${latest.defectType}</em> on ${latest.vehicleVin} (originated at ${latest.originStation} — Cause: ${latest.cause})`;
      } else {
        const randomStation = sim.stations[Math.floor(Math.random() * sim.stations.length)];
        let msg = `Station ${randomStation.id} completed cycle normally.`;
        
        if (randomStation.stressScore > 0.7) {
          msg = `⚠️ High Stress (${Math.round(randomStation.stressScore*100)}%) at Station ${randomStation.id} — elevated defect risk.`;
          li.style.color = '#FFAB40';
        } else if (randomStation.isBottleneck) {
          msg = `🚫 Station ${randomStation.id} is active bottleneck — upstream queues propagating.`;
          li.style.color = '#EF4444';
        } else if (randomStation.anomalyFlags.length > 0) {
          msg = `🔥 Anomaly flagged at ${randomStation.id}: ${randomStation.anomalyFlags.join(', ')}`;
          li.style.color = '#FFAB40';
        } else if (randomStation._neighborInferredConstraint) {
          msg = `🔍 Hidden constraint inferred at unmonitored station ${randomStation.id}.`;
          li.style.color = '#00E5FF';
        }
        
        li.innerHTML = `<strong>[${time}]</strong> ${msg}`;
      }
      
      list.insertBefore(li, list.firstChild);

      while (list.children.length > 8) {
        list.removeChild(list.lastChild);
      }
    }, 3500);
  }

  // ==========================================
  // 25. ENTANGLED SYSTEM STATE - Cross-Station Coupling Matrix
  // ==========================================
  function drawEntangledState() {
    const canvas = document.getElementById('canvas-entangled-state');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = 280;
    ctx.clearRect(0, 0, w, h);

    const stations = sim.stations;
    const n = stations.length;
    const time = performance.now() / 1000;
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(cx, cy) - 40;

    // Draw correlation web between stations
    stations.forEach((st, i) => {
      const angle1 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x1 = cx + Math.cos(angle1) * radius;
      const y1 = cy + Math.sin(angle1) * radius;

      // Draw links to correlated stations (every 2nd, 3rd neighbor + bottleneck chains)
      for (let j = i + 1; j < n; j++) {
        const st2 = stations[j];
        const angle2 = (j / n) * Math.PI * 2 - Math.PI / 2;
        const x2 = cx + Math.cos(angle2) * radius;
        const y2 = cy + Math.sin(angle2) * radius;

        // Compute coupling strength based on proximity, zone, and bottleneck propagation
        let coupling = 0;
        if (Math.abs(i - j) <= 2) coupling = 0.7 - Math.abs(i - j) * 0.2;
        if (st.zone === st2.zone) coupling += 0.1;
        if (st.isBottleneck && st2.isBlocked) coupling = 0.95;
        if (st.isBottleneck && st2.isStarved) coupling = 0.85;
        if (st.isPredictedBottleneck && Math.abs(i - j) <= 3) coupling += 0.2;

        if (coupling > 0.3) {
          const alpha = coupling * 0.5;
          const hue = coupling > 0.7 ? '239, 68, 68' : coupling > 0.5 ? '255, 171, 64' : '0, 229, 255';
          const dashPhase = time * (coupling > 0.7 ? 80 : 30);

          ctx.strokeStyle = `rgba(${hue}, ${alpha})`;
          ctx.lineWidth = coupling * 2.5;
          ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = -dashPhase;
          ctx.beginPath();
          // Bezier curve for elegant arcs
          const mx = cx + Math.cos((angle1 + angle2) / 2) * radius * (0.3 + coupling * 0.3);
          const my = cy + Math.sin((angle1 + angle2) / 2) * radius * (0.3 + coupling * 0.3);
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(mx, my, x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Animated particle along the link
          if (coupling > 0.5) {
            const t = (time * 0.5 + i * 0.1) % 1;
            const px = (1-t)*(1-t)*x1 + 2*(1-t)*t*mx + t*t*x2;
            const py = (1-t)*(1-t)*y1 + 2*(1-t)*t*my + t*t*y2;
            ctx.fillStyle = `rgba(${hue}, 0.9)`;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });

    // Draw station nodes on the ring
    const entangledNodePositions = []; // for click detection
    stations.forEach((st, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      const isSelected = st.id === selectedStationId;
      const nodeRadius = st.isBottleneck ? 8 : st.isPredictedBottleneck ? 7 : (st.isBlocked || st.isStarved) ? 6 : isSelected ? 7 : 5;
      let color = st.isBottleneck ? '#EF4444' : st.isPredictedBottleneck ? '#FFAB40' : st.isBlocked ? '#F59E0B' : st.isStarved ? '#8B5CF6' : st.zone === 'Body' ? '#00E5FF' : st.zone === 'Paint' ? '#29B6F6' : '#10B981';

      entangledNodePositions.push({ id: st.id, x, y, r: nodeRadius + 6 });

      // Selection ring — bright white pulsing outline
      if (isSelected) {
        const selPulse = 0.6 + 0.4 * Math.sin(time * 5);
        ctx.strokeStyle = `rgba(255, 255, 255, ${selPulse})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([3, 3]);
        ctx.lineDashOffset = -time * 20;
        ctx.beginPath();
        ctx.arc(x, y, nodeRadius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Glow for active bottlenecks, blocked, and starved nodes
      if (st.isBottleneck || st.isPredictedBottleneck || st.isBlocked || st.isStarved) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i);
        const glowR = (st.isBottleneck || st.isPredictedBottleneck) ? nodeRadius + 12 + pulse * 6 : nodeRadius + 8 + pulse * 3;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        glow.addColorStop(0, color + '80');
        glow.addColorStop(1, color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = isSelected ? '800 9px Inter' : '700 8px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.id, x, y);

      // Outer ring showing cycle time load
      const cycleRatio = Math.min(1, st.actualCycle / st.targetCycle);
      ctx.strokeStyle = cycleRatio > 1.2 ? '#EF4444' : cycleRatio > 1.05 ? '#FFAB40' : '#10B98160';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius + 3, -Math.PI / 2, -Math.PI / 2 + cycleRatio * Math.PI * 2);
      ctx.stroke();
    });

    // Click handler for entangled ring (attach once)
    if (!canvas._entangledClickBound) {
      canvas.addEventListener('click', (evt) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (evt.clientX - rect.left) * (canvas.width / rect.width);
        const my = (evt.clientY - rect.top) * (canvas.height / rect.height);
        let closest = null, closestDist = 20;
        (canvas._entangledNodes || []).forEach(n => {
          const d = Math.sqrt((mx - n.x) ** 2 + (my - n.y) ** 2);
          if (d < closestDist) { closest = n; closestDist = d; }
        });
        if (closest) selectStation(closest.id, 'entangled');
      });
      canvas._entangledClickBound = true;
    }
    canvas._entangledNodes = entangledNodePositions;

    // Center info
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, Math.PI * 2);
    ctx.fill();
    const healthyCount = stations.filter(s => !s.isBottleneck && !s.isPredictedBottleneck && !s.isBlocked && !s.isStarved).length;
    ctx.fillStyle = '#fff';
    ctx.font = '800 16px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${healthyCount}/${n}`, cx, cy - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 8px Inter';
    ctx.fillText('COHERENT', cx, cy + 8);

    // Legend
    const legendEl = document.getElementById('entangled-legend');
    if (legendEl) {
      legendEl.innerHTML = [
        { color: '#EF4444', label: 'Strong Coupling (Bottleneck Chain)' },
        { color: '#FFAB40', label: 'Moderate (Zone Proximity)' },
        { color: '#00E5FF', label: 'Weak (Neighbor Signal)' }
      ].map(l => `<span style="display:flex;align-items:center;gap:0.3rem;"><i style="width:8px;height:8px;border-radius:50%;background:${l.color};display:inline-block;"></i>${l.label}</span>`).join('');
    }
  }

  // ==========================================
  // 26. THROUGHPUT WAVEFORM - Phase Coherence Analysis
  // ==========================================
  let throughputWaveHistory = [];
  let throughputBottleneckEvents = []; // tracks which data points had active bottlenecks
  let throughputWaveLastTick = -1; // throttle: only push data once per sim tick
  function drawThroughputWave() {
    const canvas = document.getElementById('canvas-throughput-wave');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 360;
    const h = canvas.height = 185;
    ctx.clearRect(0, 0, w, h);

    // Only push new data once per sim tick, not every animation frame
    const metrics = sim.getSummaryMetrics();
    const currentTick = sim.tickCount || 0;
    if (currentTick !== throughputWaveLastTick) {
      throughputWaveLastTick = currentTick;
      throughputWaveHistory.push(metrics.throughputRate || 0);
      throughputBottleneckEvents.push(metrics.activeBottleneck || null);
      if (throughputWaveHistory.length > 200) { throughputWaveHistory.shift(); throughputBottleneckEvents.shift(); }
    }

    const data = throughputWaveHistory;
    if (data.length < 3) return;

    const time = performance.now() / 1000;
    const min = Math.min(...data) * 0.9;
    const max = Math.max(...data) * 1.1 || 1;
    const range = max - min || 1;

    // Background grid with animated sweep
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Target throughput line
    const targetY = h - ((42 - min) / range) * h;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(w, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.6)';
    ctx.font = '600 8px Inter';
    ctx.fillText('TARGET 42 JPH', 5, targetY - 4);

    // Main waveform with gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.25)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0)');

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((data[i] - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = grad;
    ctx.fill();

    // Moving average overlay (smoothed)
    if (data.length > 10) {
      const windowSize = 10;
      ctx.strokeStyle = 'rgba(255, 171, 64, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = windowSize; i < data.length; i++) {
        const avg = data.slice(i - windowSize, i).reduce((a, b) => a + b, 0) / windowSize;
        const x = (i / (data.length - 1)) * w;
        const y = h - ((avg - min) / range) * h;
        if (i === windowSize) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Glow dot at end
    if (data.length > 0) {
      const lastVal = data[data.length - 1];
      const lastY = h - ((lastVal - min) / range) * h;
      ctx.fillStyle = '#00E5FF';
      ctx.shadowColor = '#00E5FF';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(w, lastY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Bottleneck event markers — red vertical lines where bottlenecks were active
    throughputBottleneckEvents.forEach((btnk, i) => {
      if (!btnk) return;
      const x = (i / (data.length - 1)) * w;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      // Small red dot at the data point
      const y = h - ((data[i] - min) / range) * h;
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Selected station cycle-time indicator line
    const selSt = sim.stations.find(s => s.id === selectedStationId);
    if (selSt) {
      const stCycleJPH = Math.round(3600 / selSt.actualCycle);
      const stY = h - ((stCycleJPH - min) / range) * h;
      if (stY > 5 && stY < h - 5) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(0, stY);
        ctx.lineTo(w, stY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '600 7px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(`${selectedStationId} ~${stCycleJPH}`, w - 4, stY - 3);
      }
    }

    // Stats
    const statsEl = document.getElementById('throughput-wave-stats');
    if (statsEl) {
      const current = data[data.length - 1];
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const variance = data.reduce((s, v) => s + (v - avg) ** 2, 0) / data.length;
      const stdDev = Math.sqrt(variance);
      const btnkCount = throughputBottleneckEvents.filter(b => b).length;
      statsEl.innerHTML = `
        <span style="color:#00E5FF;">Now: <strong>${current.toFixed(1)} JPH</strong></span>
        <span style="color:#FFAB40;">Avg: <strong>${avg.toFixed(1)}</strong></span>
        <span style="color:#10B981;">σ: <strong>${stdDev.toFixed(2)}</strong></span>
        <span style="color:${variance > 25 ? '#EF4444' : '#10B981'};">Stability: <strong>${variance > 25 ? 'TURBULENT' : variance > 10 ? 'MODERATE' : 'STABLE'}</strong></span>
        <span style="color:#EF4444;">Btnk Events: <strong>${btnkCount}</strong></span>
      `;
    }
  }

  // ==========================================
  // 27. SYSTEM ENTROPY & STABILITY INDEX
  // ==========================================
  let entropyHistory = [];
  let entropyLastTick = -1; // throttle: only push data once per sim tick
  function drawEntropyGauge() {
    const canvas = document.getElementById('canvas-entropy-gauge');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 360;
    const h = canvas.height = 185;
    ctx.clearRect(0, 0, w, h);

    const stations = sim.stations;
    const time = performance.now() / 1000;

    // Calculate system entropy: higher when more stations are in abnormal states
    const abnormalCount = stations.filter(s => s.isBottleneck || s.isPredictedBottleneck || s.isBlocked || s.isStarved || s.anomalyFlags.length > 0).length;
    const entropy = (abnormalCount / stations.length) * 100;

    // Only push new data once per sim tick, not every animation frame
    const currentTick = sim.tickCount || 0;
    if (currentTick !== entropyLastTick) {
      entropyLastTick = currentTick;
      entropyHistory.push(entropy);
      if (entropyHistory.length > 150) entropyHistory.shift();
    }

    // Left half: Gauge arc
    const gaugeX = Math.min(w * 0.28, 80);
    const gaugeY = h * 0.50;
    const gaugeR = Math.min(gaugeX, gaugeY) * 0.72;
    const startAngle = Math.PI * 0.8;
    const endAngle = Math.PI * 2.2;
    const totalArc = endAngle - startAngle;
    const valueAngle = startAngle + (entropy / 100) * totalArc;

    // Background arc
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY, gaugeR, startAngle, endAngle);
    ctx.stroke();

    // Value arc with gradient
    const arcColor = entropy > 60 ? '#EF4444' : entropy > 30 ? '#FFAB40' : '#10B981';
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.shadowColor = arcColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY, gaugeR, startAngle, valueAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center value
    ctx.fillStyle = arcColor;
    ctx.font = '800 16px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${entropy.toFixed(0)}%`, gaugeX, gaugeY - 3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 7px Inter';
    ctx.fillText('ENTROPY', gaugeX, gaugeY + 12);

    // Right half: Entropy history sparkline
    const chartX = Math.max(w * 0.44, gaugeX + gaugeR + 15);
    const chartW = w - chartX - 10;
    const chartY = 16;
    const chartH = h - 32;

    if (entropyHistory.length > 2) {
      const min = 0;
      const max = 100;
      const range = max - min;

      // Danger zone
      const dangerY = chartY + chartH - (60 / range) * chartH;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
      ctx.fillRect(chartX, chartY, chartW, dangerY - chartY);

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(chartX, dangerY);
      ctx.lineTo(chartX + chartW, dangerY);
      ctx.stroke();
      ctx.setLineDash([]);

      // History line
      ctx.strokeStyle = arcColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      entropyHistory.forEach((v, i) => {
        const x = chartX + (i / (entropyHistory.length - 1)) * chartW;
        const y = chartY + chartH - (v / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Fill under
      const fillGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
      fillGrad.addColorStop(0, arcColor + '30');
      fillGrad.addColorStop(1, arcColor + '00');
      ctx.lineTo(chartX + chartW, chartY + chartH);
      ctx.lineTo(chartX, chartY + chartH);
      ctx.fillStyle = fillGrad;
      ctx.fill();
    }

    // Stats
    const statsEl = document.getElementById('entropy-stats');
    if (statsEl) {
      const status = entropy > 60 ? 'CRITICAL' : entropy > 30 ? 'ELEVATED' : 'NOMINAL';
      const statusColor = entropy > 60 ? '#EF4444' : entropy > 30 ? '#FFAB40' : '#10B981';
      const selSt = sim.stations.find(s => s.id === selectedStationId);
      const selState = selSt ? (selSt.isBottleneck ? '🔴 BTNK' : selSt.isPredictedBottleneck ? '🟡 PRED' : selSt.isBlocked ? '⬛ BLKD' : selSt.isStarved ? '⬜ STRV' : '🟢 OK') : '--';
      statsEl.innerHTML = `
        <span style="color:${statusColor};">Status: <strong>${status}</strong></span>
        <span style="color:#aaa;">Abnormal: <strong>${abnormalCount}/${stations.length}</strong></span>
        <span style="color:#aaa;">Peak: <strong>${Math.max(...entropyHistory).toFixed(0)}%</strong></span>
        <span style="color:#00E5FF;">${selectedStationId}: <strong>${selState}</strong></span>
      `;
    }
  }

  // ==========================================
  // 28. STATION DEPENDENCY NETWORK - Force-Directed Graph
  // ==========================================
  let depNetworkMode = 'force';
  let depNodes = [];
  let depInitialized = false;
  function initDependencyNetwork() {
    const btnForce = document.getElementById('btn-dep-force');
    const btnArc = document.getElementById('btn-dep-arc');
    if (btnForce) btnForce.addEventListener('click', () => { depNetworkMode = 'force'; btnForce.classList.add('active'); btnArc?.classList.remove('active'); });
    if (btnArc) btnArc.addEventListener('click', () => { depNetworkMode = 'arc'; btnArc.classList.add('active'); btnForce?.classList.remove('active'); });
  }

  function drawDependencyNetwork() {
    const canvas = document.getElementById('canvas-dependency-network');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 400;
    const h = canvas.height = 185;
    ctx.clearRect(0, 0, w, h);

    const stations = sim.stations;
    const time = performance.now() / 1000;

    if (!depInitialized || depNodes.length !== stations.length) {
      depNodes = stations.map((st, i) => ({
        id: st.id,
        x: w * 0.1 + (i % 7) * (w * 0.13),
        y: h * 0.15 + Math.floor(i / 7) * (h * 0.18),
        vx: 0, vy: 0,
        station: st
      }));
      depInitialized = true;
    }

    if (depNetworkMode === 'force') {
      // Simple force simulation
      depNodes.forEach(n => { n.station = sim.stations.find(s => s.id === n.id) || n.station; });
      for (let iter = 0; iter < 3; iter++) {
        depNodes.forEach((a, i) => {
          depNodes.forEach((b, j) => {
            if (i >= j) return;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(20, Math.sqrt(dx*dx + dy*dy));
            const repulse = 800 / (dist * dist);
            a.vx -= dx / dist * repulse;
            a.vy -= dy / dist * repulse;
            b.vx += dx / dist * repulse;
            b.vy += dy / dist * repulse;

            // Attract neighbors
            if (Math.abs(i - j) <= 2) {
              const attract = (dist - 60) * 0.02;
              a.vx += dx / dist * attract;
              a.vy += dy / dist * attract;
              b.vx -= dx / dist * attract;
              b.vy -= dy / dist * attract;
            }
          });
          // Center gravity
          a.vx += (w/2 - a.x) * 0.001;
          a.vy += (h/2 - a.y) * 0.001;
          a.vx *= 0.85;
          a.vy *= 0.85;
          a.x = Math.max(20, Math.min(w - 20, a.x + a.vx));
          a.y = Math.max(20, Math.min(h - 20, a.y + a.vy));
        });
      }

      // Draw edges
      depNodes.forEach((a, i) => {
        for (let j = i + 1; j < depNodes.length; j++) {
          const b = depNodes[j];
          const isNeighbor = Math.abs(i - j) <= 2;
          
          const aIsBtnk = a.station.isBottleneck;
          const bIsBtnk = b.station.isBottleneck;
          const isCausalBlocked = (aIsBtnk && b.station.isBlocked) || (bIsBtnk && a.station.isBlocked);
          const isCausalStarved = (aIsBtnk && b.station.isStarved) || (bIsBtnk && a.station.isStarved);
          const isCausalGeneral = (aIsBtnk && (b.station.isBlocked || b.station.isStarved)) || (bIsBtnk && (a.station.isBlocked || a.station.isStarved));

          if (isNeighbor || isCausalGeneral) {
            let strokeColor = 'rgba(255, 255, 255, 0.15)';
            let lineWidth = 0.8;
            let isDashed = false;

            if (isCausalBlocked) {
              strokeColor = 'rgba(245, 158, 11, 0.85)';
              lineWidth = 2.2;
              isDashed = true;
            } else if (isCausalStarved) {
              strokeColor = 'rgba(139, 92, 246, 0.85)';
              lineWidth = 2.2;
              isDashed = true;
            } else if (isCausalGeneral) {
              strokeColor = 'rgba(239, 68, 68, 0.8)';
              lineWidth = 2.0;
              isDashed = true;
            }

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth;
            if (isDashed) {
              ctx.setLineDash([5, 4]);
              ctx.lineDashOffset = -time * 35;
            }
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });

      // Draw nodes
      depNodes.forEach(n => {
        const st = n.station;
        const isSelected = st.id === selectedStationId;
        
        let color = '#00E5FF';
        if (st.isBottleneck) color = '#EF4444';
        else if (st.isPredictedBottleneck) color = '#FFAB40';
        else if (st.isBlocked) color = '#F59E0B';
        else if (st.isStarved) color = '#8B5CF6';
        else if (st.zone === 'Paint') color = '#29B6F6';
        else if (st.zone === 'Assembly') color = '#10B981';

        const r = st.isBottleneck ? 13 : st.isPredictedBottleneck ? 11 : (st.isBlocked || st.isStarved) ? 10 : isSelected ? 9 : 7.5;

        if (st.isBottleneck) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4);
          ctx.shadowColor = '#EF4444';
          ctx.shadowBlur = 16 + pulse * 12;
        } else if (st.isBlocked) {
          ctx.shadowColor = '#F59E0B';
          ctx.shadowBlur = 8;
        } else if (st.isStarved) {
          ctx.shadowColor = '#8B5CF6';
          ctx.shadowBlur = 8;
        }

        // Selection ring
        if (isSelected) {
          const selPulse = 0.6 + 0.4 * Math.sin(time * 5);
          ctx.strokeStyle = `rgba(255, 255, 255, ${selPulse})`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([3, 3]);
          ctx.lineDashOffset = -time * 20;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = color + '35';
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#fff' : color;
        ctx.lineWidth = st.isBottleneck ? 2.5 : isSelected ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fff';
        ctx.font = `${st.isBottleneck || isSelected ? '700 9px' : '600 8px'} Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.id, n.x, n.y);
      });

      // Click handler for dependency network (attach once)
      if (!canvas._depClickBound) {
        canvas.addEventListener('click', (evt) => {
          const rect = canvas.getBoundingClientRect();
          const mx = (evt.clientX - rect.left) * (canvas.width / rect.width);
          const my = (evt.clientY - rect.top) * (canvas.height / rect.height);
          let closest = null, closestDist = 20;
          depNodes.forEach(n => {
            const d = Math.sqrt((mx - n.x) ** 2 + (my - n.y) ** 2);
            if (d < closestDist) { closest = n; closestDist = d; }
          });
          if (closest) selectStation(closest.id, 'dependency');
        });
        canvas._depClickBound = true;
      }
    } else {
      // Arc diagram mode
      const arcY = h * 0.7;
      const pad = 30;
      const step = (w - pad * 2) / (stations.length - 1);

      stations.forEach((st, i) => {
        const x = pad + i * step;
        for (let j = i + 1; j < stations.length; j++) {
          const st2 = stations[j];
          const x2 = pad + j * step;
          const isRelated = Math.abs(i - j) <= 2 || (st.isBottleneck && (st2.isBlocked || st2.isStarved)) || (st2.isBottleneck && (st.isBlocked || st.isStarved));
          if (!isRelated) continue;

          const isCausalBlocked = (st.isBottleneck && st2.isBlocked) || (st2.isBottleneck && st.isBlocked);
          const isCausalStarved = (st.isBottleneck && st2.isStarved) || (st2.isBottleneck && st.isStarved);
          const isCausal = isCausalBlocked || isCausalStarved || (st.isBottleneck && (st2.isBlocked || st2.isStarved));

          let arcColor = 'rgba(0, 229, 255, 0.15)';
          if (isCausalBlocked) arcColor = 'rgba(245, 158, 11, 0.7)';
          else if (isCausalStarved) arcColor = 'rgba(139, 92, 246, 0.7)';
          else if (isCausal) arcColor = 'rgba(239, 68, 68, 0.7)';

          ctx.strokeStyle = arcColor;
          ctx.lineWidth = isCausal ? 2.2 : 1;
          ctx.beginPath();
          ctx.arc((x + x2) / 2, arcY, (x2 - x) / 2, Math.PI, 0);
          ctx.stroke();
        }

        let color = '#00E5FF';
        if (st.isBottleneck) color = '#EF4444';
        else if (st.isPredictedBottleneck) color = '#FFAB40';
        else if (st.isBlocked) color = '#F59E0B';
        else if (st.isStarved) color = '#8B5CF6';
        else if (st.zone === 'Paint') color = '#29B6F6';
        else if (st.zone === 'Assembly') color = '#10B981';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, arcY, st.isBottleneck ? 7 : (st.isBlocked || st.isStarved) ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '600 7px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(st.id, x, arcY + 14);
      });
    }
  }

  function drawMiniMap() {
    const canvas = document.getElementById('canvas-mini-map');
    if (!canvas) return;

    // Render at native device resolution so the widget is crisp, not a
    // blurry stretched 150x100 bitmap, while keeping a stable CSS coordinate
    // system (w/h below) for all the drawing math.
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 150;
    const cssH = canvas.clientHeight || 100;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW, h = cssH;
    ctx.clearRect(0, 0, w, h);

    const pad = 12;
    const numStations = sim.stations.length;
    const step = numStations > 1 ? (w - pad*2) / (numStations - 1) : 0;
    const midY = h / 2 + 4;

    // Zone shading so the line reads as Body / Paint / Assembly, not a flat bar
    const zoneColors = ['rgba(59,130,246,0.16)', 'rgba(41,182,246,0.16)', 'rgba(0,229,255,0.16)'];
    const zoneLabels = ['BODY', 'PAINT', 'ASSY'];
    const zoneWidth = (w - pad*2) / 3;
    zoneColors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(pad + i * zoneWidth, 6, zoneWidth, h - 20);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '7px var(--font-mono, monospace)';
      ctx.textAlign = 'left';
      ctx.fillText(zoneLabels[i], pad + i * zoneWidth + 3, 14);
    });

    // Base track — brighter, thicker so it reads clearly at a glance
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pad, midY);
    ctx.lineTo(w - pad, midY);
    ctx.stroke();

    // Animated flow pulse traveling along the line (gives the widget visible motion)
    const t = (performance.now() / 1000) % 4 / 4; // 0..1 loop every 4s
    const flowX = pad + t * (w - pad*2);
    const flowGrad = ctx.createRadialGradient(flowX, midY, 0, flowX, midY, 16);
    flowGrad.addColorStop(0, 'rgba(0, 229, 255, 0.5)');
    flowGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = flowGrad;
    ctx.beginPath();
    ctx.arc(flowX, midY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Stations — also record their screen position for hover/click hit-testing
    miniMapStationPoints = [];
    sim.stations.forEach((st, i) => {
      const x = pad + i * step;
      const y = midY;
      const isAlert = st.isBottleneck || st.isPredictedBottleneck || st.isBlocked || st.isStarved;
      const isSelected = st.id === selectedStationId;
      const isHovered = st.id === miniMapHoverId;
      const color = st.isBottleneck ? '#ef4444' : st.isPredictedBottleneck ? '#ffab40' : st.isBlocked ? '#f59e0b' : st.isStarved ? '#8b5cf6' : '#10b981';

      // Soft glow halo for anything flagged, so a bottleneck is unmistakable
      if (isAlert || isHovered || isSelected) {
        const basePulse = isAlert ? 4 + Math.sin(performance.now() / 220 + i) * 2 : 2;
        const pulse = isHovered ? basePulse + 4 : basePulse;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 8 + pulse);
        glow.addColorStop(0, (isHovered ? '#00E5FF' : color) + 'cc');
        glow.addColorStop(1, (isHovered ? '#00E5FF' : color) + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 8 + pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, isAlert ? 3.5 : (isHovered ? 3.2 : 2.5), 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      miniMapStationPoints.push({ id: st.id, name: st.name, station: st, x, y, isAlert, color });
    });

    // Vehicles in transit
    sim.vehicles.forEach(v => {
      if (v.stationIdx < numStations) {
        const x = pad + v.stationIdx * step;
        const y = midY - 9;
        ctx.fillStyle = '#80D8FF';
        ctx.shadowColor = '#00E5FF';
        ctx.shadowBlur = 5;
        ctx.fillRect(x - 2, y, 4, 4);
        ctx.shadowBlur = 0;
      }
    });

    updateMiniMapStatusLine();
  }

  function updateMiniMapStatusLine() {
    const healthyEl = document.getElementById('mini-map-healthy-count');
    const alertEl = document.getElementById('mini-map-active-alert');
    if (!healthyEl || !alertEl) return;

    const healthy = sim.stations.filter(s => !s.isBottleneck && !s.isPredictedBottleneck).length;
    healthyEl.textContent = healthy;

    const activeBottleneck = sim.stations.find(s => s.isBottleneck);
    const predicted = sim.stations.find(s => s.isPredictedBottleneck);
    if (activeBottleneck) {
      alertEl.textContent = `⚠ ${activeBottleneck.id} bottleneck`;
      alertEl.style.color = '#ef4444';
    } else if (predicted) {
      alertEl.textContent = `${predicted.id} watch`;
      alertEl.style.color = '#ffab40';
    } else {
      alertEl.textContent = 'All clear';
      alertEl.style.color = '#10b981';
    }
  }

  // Hover tooltip + click-to-select for the mini-map, wired once.
  function initMiniMapInteractivity() {
    if (miniMapInteractivityBound) return;
    const canvas = document.getElementById('canvas-mini-map');
    if (!canvas) return;
    miniMapInteractivityBound = true;

    let tooltip = document.getElementById('mini-map-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'mini-map-tooltip';
      tooltip.className = 'mini-map-tooltip';
      document.body.appendChild(tooltip);
    }

    function nearestStation(evt) {
      const rect = canvas.getBoundingClientRect();
      const mx = evt.clientX - rect.left;
      const my = evt.clientY - rect.top;
      let best = null, bestDist = Infinity;
      miniMapStationPoints.forEach(p => {
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestDist) { bestDist = d; best = p; }
      });
      return bestDist <= 9 ? best : null;
    }

    canvas.addEventListener('mousemove', (evt) => {
      const hit = nearestStation(evt);
      miniMapHoverId = hit ? hit.id : null;
      canvas.style.cursor = hit ? 'pointer' : 'default';

      if (hit) {
        const status = hit.station.isBottleneck ? 'Bottleneck' : hit.station.isPredictedBottleneck ? 'Predicted risk' : 'Healthy';
        tooltip.innerHTML = `<div class="mmt-title" style="color:${hit.color}">${hit.id} · ${hit.name || ''}</div>` +
          `Status: ${status}<div class="mmt-hint">Click to inspect</div>`;
        tooltip.style.left = (evt.clientX + 14) + 'px';
        tooltip.style.top = (evt.clientY - 10) + 'px';
        tooltip.classList.add('visible');
      } else {
        tooltip.classList.remove('visible');
      }
    });

    canvas.addEventListener('mouseleave', () => {
      miniMapHoverId = null;
      tooltip.classList.remove('visible');
    });

    canvas.addEventListener('click', (evt) => {
      const hit = nearestStation(evt);
      if (!hit) return;
      selectStation(hit.id, 'minimap');
      switchTab('supervisor');
      showToast(`Jumped to ${hit.id} — ${hit.name || ''}`, 'info');
    });

    const toggleBtn = document.getElementById('btn-toggle-minimap');
    const miniMapContainer = document.getElementById('mini-map');
    if (toggleBtn && miniMapContainer) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = miniMapContainer.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? '▲' : '▼';
        toggleBtn.title = isCollapsed ? 'Expand Line Overview' : 'Collapse Line Overview';
      });
    }
  }

  // Kick off
  init();
});
