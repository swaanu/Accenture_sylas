// ================================================================
// Modelling & Physics View Component (PINN Solvers & Data Gap Analysis)
// ================================================================

export class ModellingView {
    constructor(evidenceEngine, dataGapEngine) {
        this.evidence = evidenceEngine;
        this.dataGap = dataGapEngine;
    }

    renderStationEvidence(stationId, station) {
        return this.evidence.computePinnLive(stationId, station);
    }

    renderDataGapAudit(stations) {
        return this.dataGap.getGapAnalysisSummary(stations);
    }
}
