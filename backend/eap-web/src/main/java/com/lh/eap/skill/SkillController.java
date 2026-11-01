package com.lh.eap.skill;

import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/skills")
public class SkillController {
    private static final JsonMapper JSON = JsonMapper.builder().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private final SkillService skills;
    public SkillController(SkillService skills) { this.skills = skills; }
    @PostMapping("/preview") public SkillService.Snapshot preview(@RequestBody(required = false) String body) { return skills.preview(parse(body)); }
    @PostMapping public SkillService.Snapshot save(@RequestBody(required = false) String body) { return skills.save(parse(body)); }
    @GetMapping public SkillService.Listing list() { return skills.list(); }
    @GetMapping("/{id}/versions/{version}") public SkillService.Snapshot get(@PathVariable String id, @PathVariable String version) { return skills.get(id,version); }
    @PostMapping("/{id}/versions/{version}/activation") public SkillService.Snapshot activate(@PathVariable String id, @PathVariable String version, @RequestBody(required = false) String body) { return skills.activate(id,version,parse(body)); }
    @PostMapping("/context/preview") public SkillService.Context context(@RequestBody(required = false) String body) { return skills.previewContext(parse(body)); }
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    public org.springframework.http.ProblemDetail unavailable() { return org.springframework.http.ProblemDetail.forStatusAndDetail(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "SKILL_UNAVAILABLE"); }
    private static Object parse(String body) {
        if (body == null || body.length() > 200000) throw SkillTextParser.invalid("INVALID_SKILL_INPUT");
        try { return JSON.readValue(body, Object.class); }
        catch (RuntimeException invalid) { throw SkillTextParser.invalid("INVALID_SKILL_INPUT"); }
    }
}
