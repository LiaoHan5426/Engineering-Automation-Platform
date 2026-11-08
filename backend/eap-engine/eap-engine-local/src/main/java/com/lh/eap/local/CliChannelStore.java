package com.lh.eap.local;

import java.util.Map;

/** Operator binary bindings. Empty means a successful read with no overrides, never a storage failure. */
public interface CliChannelStore {
    Map<String, String> overrides();
    /** Persist a validated binary, or delete the binding when blank. The adapter owns its transaction. */
    void configure(String program, String binary);

    static CliChannelStore readOnlyDefaults() {
        return new CliChannelStore() {
            @Override public Map<String, String> overrides() { return Map.of(); }
            @Override public void configure(String program, String binary) {
                throw new IllegalStateException("当前未连接配置存储，无法修改 CLI 通道");
            }
        };
    }
}
