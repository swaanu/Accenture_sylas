// ================================================================
// Leadership View Component (Rollout, ROI & Enterprise Site Normalization)
// ================================================================

export class LeadershipView {
    constructor(simEngine, dataGapEngine) {
        this.sim = simEngine;
        this.dataGap = dataGapEngine;
    }

    renderRoiTradeoff(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        return this.sim.getSensorRoiTradeoffTable();
    }

    renderSiteHealthIndex() {
        return this.sim.getTwinHealthScore();
    }
}
