package com.lh.eap.application.dto;

import java.util.*;

public record DatabaseProfileRequest(String label,String engine,String environment,Map<String,Object> metadata) { }
