package com.lh.eap.web;

import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/databases")
public class DatabaseInfoController {
    @GetMapping
    public Map<String, Object> list() {
        return Map.of("items", List.of(Map.of("id", "local-postgres", "label", "Local PostgreSQL", "engine", "PostgreSQL", "environment", "local", "credentialsExposed", false)), "policy", "Only sanitized metadata is available to experts");
    }
}
