package com.lh.eap.api.contract;
import java.util.Locale;

/** A finite, case-sensitive wire vocabulary. Invalid data is never business UNKNOWN. */
public interface WireValue {
    String wire();
    static <E extends Enum<E> & WireValue> E parse(Class<E> type, String value) {
        for (E candidate : type.getEnumConstants()) if (candidate.wire().equals(value)) return candidate;
        throw new IllegalArgumentException("INVALID_" + type.getSimpleName().replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT));
    }
}
