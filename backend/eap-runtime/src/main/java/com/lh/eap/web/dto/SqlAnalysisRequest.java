package com.lh.eap.web.dto;

import java.util.*;

public record SqlAnalysisRequest(String sql,String question,String expertId,UUID databaseId,Map<String,Object> explainPlan,Boolean enhanceWithModel,String pattern) { }
