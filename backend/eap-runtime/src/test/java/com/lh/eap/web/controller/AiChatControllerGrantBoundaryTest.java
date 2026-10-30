package com.lh.eap.web.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class AiChatControllerGrantBoundaryTest {
    @Test
    void postWorkspaceGrantsIsRefusedAsRemoteGrantStore() {
        var controller = new AiChatController(null);
        var failure = assertThrows(ResponseStatusException.class, controller::refuseUserDirectoryGrants);
        assertEquals(HttpStatus.METHOD_NOT_ALLOWED, failure.getStatusCode());
        assertEquals("USER_DIRECTORY_GRANTS_NOT_STORED_ON_SERVER", failure.getReason());
    }
}
