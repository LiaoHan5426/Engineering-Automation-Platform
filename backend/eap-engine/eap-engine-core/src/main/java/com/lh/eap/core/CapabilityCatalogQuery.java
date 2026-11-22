package com.lh.eap.core;

import com.lh.eap.domain.model.CliOperation;
import java.util.List;

/**
 * Read-only query the capability catalog uses to reconcile the declared CLI vocabulary against
 * registered handlers. No SQL, no adapter types leak through this port.
 */
@FunctionalInterface
public interface CapabilityCatalogQuery {
    /** Every persisted CLI operation binding, including built-in ones. */
    List<CliOperation> operations();

    /** Empty vocabulary for compositions that do not include the CLI registry. */
    static CapabilityCatalogQuery empty() { return List::of; }
}
