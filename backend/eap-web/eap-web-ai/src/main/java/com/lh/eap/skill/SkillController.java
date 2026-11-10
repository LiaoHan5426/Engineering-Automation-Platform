package com.lh.eap.skill;
import com.lh.eap.web.i18n.ProblemResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ProblemDetail;
import tools.jackson.core.StreamReadFeature;
import com.lh.eap.error.SkillErrors;

import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/skills")
public class SkillController {
    private static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private final SkillService skills;
    private final ProblemResponses problems;
    public SkillController(SkillService skills, ProblemResponses problems) { this.skills = skills; this.problems = problems; }
    @PostMapping("/preview") public SkillService.Snapshot preview(@RequestBody(required = false) String body) { return skills.preview(parse(body)); }
    @PostMapping public SkillService.Snapshot save(@RequestBody(required = false) String body) { return skills.save(parse(body)); }
    @GetMapping public SkillService.Listing list() { return skills.list(); }
    @GetMapping("/{id}/versions/{version}") public SkillService.Snapshot get(@PathVariable String id, @PathVariable String version) { return skills.get(id,version); }
    @PostMapping("/{id}/versions/{version}/activation") public SkillService.Snapshot activate(@PathVariable String id, @PathVariable String version, @RequestBody(required = false) String body) { return skills.activate(id,version,parse(body)); }
    @PostMapping("/context/preview") public SkillService.Context context(@RequestBody(required = false) String body) { return skills.previewContext(parse(body)); }
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail unavailable(HttpServletRequest request, HttpServletResponse response) { return problems.create(503, SkillErrors.SKILL_UNAVAILABLE.code(), request, response); }
    private static Object parse(String body) {
        if (body == null || body.length() > 200000) throw SkillTextParser.invalid(SkillErrors.INVALID_SKILL_INPUT.code());
        try { return JSON.readValue(body, Object.class); }
        catch (RuntimeException invalid) { throw SkillTextParser.invalid(SkillErrors.INVALID_SKILL_INPUT.code()); }
    }
}
