// ================================================================
// Plant Manager View Component (Weekly Trends & RUL Maintenance)
// ================================================================

export class ManagerView {
    constructor(simEngine) {
        this.sim = simEngine;
    }

    renderShiftingBottlenecks(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        return this.sim.getBottleneckHistory ? this.sim.getBottleneckHistory() : [];
    }

    renderRulSchedule(tableId) {
        const table = document.getElementById(tableId);
        if (!table) return;
        return this.sim.stations.map(s => s.rul);
    }
}
