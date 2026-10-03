package com.lh.eap.api;

import java.nio.file.Path;
import java.util.List;

public interface ProcessExecutor { Observation run(String capability, Path workingDirectory, List<String> command); }
