package com.lh.eap.application.service;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
class BoardPreviewAddressTest {
    @ParameterizedTest @ValueSource(strings={"http://127.0.0.1:5193/#detail", "https://localhost/view?route=task", "http://[::1]:5193/"})
    void acceptsExplicitLocalRoutes(String value) { assertTrue(BoardDeliveryService.validPreviewUrl(value)); }
    @ParameterizedTest @ValueSource(strings={"", "javascript:alert(1)", "http://user:secret@localhost/", "http://localhost.example/", "http://localhost:0/", "http://localhost:65536/", "file:///tmp/index.html", " http://localhost/"})
    void rejectsUnsafeOrMissingAddresses(String value) { assertFalse(BoardDeliveryService.validPreviewUrl(value)); }
}
