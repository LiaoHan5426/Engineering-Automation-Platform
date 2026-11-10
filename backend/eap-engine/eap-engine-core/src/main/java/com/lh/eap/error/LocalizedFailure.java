package com.lh.eap.error;
import java.util.Objects;

import com.lh.eap.api.error.PlatformErrorCode;

/** A platform code with bounded public numeric parameters; never an exception/SQL/provider body. */
public final class LocalizedFailure extends RuntimeException {
    public enum Kind { INVALID, FORBIDDEN, NOT_FOUND, CONFLICT, UNAVAILABLE }
    private final Kind kind;
    private final PlatformErrorCode code;
    private final Object[] arguments;
    public LocalizedFailure(Kind kind, PlatformErrorCode code, Number... arguments) {
        super(code.code());
        this.kind = Objects.requireNonNull(kind);
        this.code = code;
        if (arguments.length > 8) throw new IllegalArgumentException("Too many public message arguments");
        this.arguments = arguments.clone();
    }
    public Object[] messageArguments() { return arguments.clone(); }
    public Kind kind() { return kind; }
    public String code() { return code.code(); }
}
