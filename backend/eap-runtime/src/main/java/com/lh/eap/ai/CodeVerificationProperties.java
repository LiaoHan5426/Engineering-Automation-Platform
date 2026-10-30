package com.lh.eap.ai;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "eap.runtime.verification")
public class CodeVerificationProperties {
    private boolean enabled;
    private int timeoutSeconds = 120;
    private List<Command> commands = new ArrayList<>();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public int getTimeoutSeconds() { return timeoutSeconds; }
    public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
    public List<Command> getCommands() { return commands; }
    public void setCommands(List<Command> commands) { this.commands = commands == null ? new ArrayList<>() : commands; }

    public static class Command {
        private String name = "";
        private List<String> run = new ArrayList<>();
        public String getName() { return name; }
        public void setName(String name) { this.name = name == null ? "" : name; }
        public List<String> getRun() { return run; }
        public void setRun(List<String> run) { this.run = run == null ? new ArrayList<>() : run; }
    }
}
