// ================================================================
// Predictive Validation View Component (80/20 Train/Holdout & SPC)
// ================================================================

export class PredictiveView {
    constructor(predictiveEngine) {
        this.predictive = predictiveEngine;
    }

    renderValidationDashboard() {
        return this.predictive.getValidationDashboard();
    }

    renderSpcAnalysis(history, stationId) {
        return this.predictive.getSPCAnalysis(history, stationId);
    }
}
