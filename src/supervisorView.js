// ================================================================
// Supervisor View Component (Real-Time Floor Level 0–60 min horizon)
// ================================================================

export class SupervisorView {
    constructor(simEngine, predictiveEngine) {
        this.sim = simEngine;
        this.predictive = predictiveEngine;
    }

    renderRadar(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const summary = this.sim.getSummaryMetrics();
        // Live station states and active bottleneck highlight
        return summary;
    }

    renderLiveAlerts(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const alerts = this.predictive.getActiveAlerts ? this.predictive.getActiveAlerts() : [];
        return alerts;
    }
}
