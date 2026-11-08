package com.lh.eap.rules;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RulePackQueryTest {
    @Test void factCatalogKeepsTheExistingJsonContractWithoutReadingStorage() {
        var jdbc = mock(JdbcTemplate.class);
        RulePackQuery query = new RulePackService(jdbc);
        var json = JsonMapper.builder().build();
        assertFalse(query.facts().isEmpty());
        assertEquals(json.valueToTree(SqlFactVocabulary.FACTS), json.valueToTree(query.facts()));
        verifyNoInteractions(jdbc);
    }
}
