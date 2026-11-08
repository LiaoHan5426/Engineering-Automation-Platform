package com.lh.eap.persistence.mapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class KnowledgeManagementMapper {
    private final JdbcTemplate jdbc;
    public KnowledgeManagementMapper(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public List<Map<String,Object>> list() { return jdbc.queryForList("SELECT b.id,b.name,b.description,count(d.id) AS documents FROM eap.knowledge_base b LEFT JOIN eap.knowledge_document d ON d.knowledge_base_id=b.id GROUP BY b.id ORDER BY b.created_at DESC"); }
    public void insertBase(UUID id,String name,String description) { jdbc.update("INSERT INTO eap.knowledge_base(id,name,description) VALUES (?,?,?)",id,name,description); }
    public List<Map<String,Object>> documents(UUID id) { return jdbc.queryForList("SELECT d.id,d.object_key AS title,string_agg(c.content, '' ORDER BY c.chunk_index) AS content FROM eap.knowledge_document d LEFT JOIN eap.knowledge_chunk c ON c.document_id=d.id WHERE d.knowledge_base_id=? GROUP BY d.id ORDER BY d.created_at DESC",id); }
    public boolean exists(UUID id) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM eap.knowledge_base WHERE id=?)",Boolean.class,id)); }
    public void insertDocument(UUID document,UUID base,String title,String hash) { jdbc.update("INSERT INTO eap.knowledge_document(id,knowledge_base_id,object_key,content_sha256,media_type) VALUES (?,?,?,?,?)",document,base,title,hash,"text/plain"); }
    public void insertChunk(UUID document,int index,String content) { jdbc.update("INSERT INTO eap.knowledge_chunk(id,document_id,chunk_index,content,embedding_model) VALUES (?,?,?,?,?)",UUID.randomUUID(),document,index,content,"not-embedded"); }
    public int rename(UUID id,String name,String description) { return jdbc.update("UPDATE eap.knowledge_base SET name=?,description=? WHERE id=?",name,description,id); }
    public List<Map<String,Object>> enabledReferences(UUID id) { return jdbc.queryForList("SELECT id FROM eap.expert_definition WHERE enabled AND manifest->'knowledgeBases' @> to_jsonb(?::text)",id.toString()); }
    public int deleteBase(UUID id) { return jdbc.update("DELETE FROM eap.knowledge_base WHERE id=?",id); }
    public int deleteDocument(UUID base,UUID document) { return jdbc.update("DELETE FROM eap.knowledge_document WHERE id=? AND knowledge_base_id=?",document,base); }
}
