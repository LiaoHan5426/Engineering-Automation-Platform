package com.lh.eap.web.controller;
import com.lh.eap.ai.WorkspaceFilesService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/workspace")
public final class WorkspaceFilesController {
    private final WorkspaceFilesService files;
    public WorkspaceFilesController(WorkspaceFilesService files) { this.files = files; }
    @GetMapping("/files")
    public WorkspaceFilesService.Listing files(@RequestParam(defaultValue = "") String path) { return files.list(path); }
}
