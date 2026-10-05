package com.lh.eap.api.expert;

public interface Expert<I, O> {
    AnalysisResult<O> analyze(I input, ExpertContext context);
}
