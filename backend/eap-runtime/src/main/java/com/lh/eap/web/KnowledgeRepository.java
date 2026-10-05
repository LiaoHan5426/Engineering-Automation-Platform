package com.lh.eap.web;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.*;
import java.util.regex.Pattern;

@Repository
public class KnowledgeRepository {
    private final JdbcTemplate jdbc;
    public KnowledgeRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public List<Map<String,Object>> search(String query,int limit){return searchInternal(query,limit,null);}
    public List<Map<String,Object>> searchAuthorized(String query,int limit,List<UUID> allowed){
        if(allowed==null||allowed.isEmpty())return List.of();
        return searchInternal(query,limit,allowed);
    }
    static List<String> terms(String query){
        var result=new LinkedHashSet<String>();
        var matcher=Pattern.compile("[a-zA-Z0-9_]{2,}|[\\p{IsHan}]{2,}").matcher(query);
        while(matcher.find()&&result.size()<24){
            var token=matcher.group().toLowerCase(Locale.ROOT);
            if(token.codePoints().allMatch(cp->Character.UnicodeScript.of(cp)==Character.UnicodeScript.HAN)){
                for(int i=0;i<token.length()-1&&result.size()<24;i++){
                    var part=token.substring(i,i+2);
                    if(!Set.of("如何","这个","什么","为什么","是否","需要","进行","可以","一个").contains(part))result.add(part);
                }
            }else if(!Set.of("select","from","where","and","the","how","this").contains(token))result.add(token);
        }
        return List.copyOf(result);
    }
    private List<Map<String,Object>> searchInternal(String query,int limit,List<UUID> allowed){
        if(query==null||query.isBlank())return List.of();
        query=query.substring(0,Math.min(query.length(),500));
        var terms=terms(query);
        var args=new ArrayList<Object>();
        var score=new StringBuilder("ts_rank(to_tsvector('simple',c.content),websearch_to_tsquery('simple',?))");
        args.add(query);
        for(var term:terms){score.append(" + CASE WHEN c.content ILIKE ? ESCAPE '\\' THEN 1.0 ELSE 0.0 END");args.add(like(term));}
        var sql=new StringBuilder("SELECT c.id,d.object_key,b.name AS knowledge_base,c.content,("+score+") AS score FROM eap.knowledge_chunk c JOIN eap.knowledge_document d ON d.id=c.document_id JOIN eap.knowledge_base b ON b.id=d.knowledge_base_id WHERE (to_tsvector('simple',c.content) @@ websearch_to_tsquery('simple',?)");
        args.add(query);
        for(var term:terms){sql.append(" OR c.content ILIKE ? ESCAPE '\\'");args.add(like(term));}
        sql.append(")");
        if(allowed!=null){sql.append(" AND b.id IN ("+String.join(",",Collections.nCopies(allowed.size(),"?"))+")");args.addAll(allowed);}
        sql.append(" ORDER BY score DESC,c.id LIMIT ?");args.add(Math.clamp(limit,1,20));
        return jdbc.query(sql.toString(),(rs,row)->{
            var content=rs.getString("content");
            return Map.<String,Object>of("id",rs.getObject("id"),"source",SensitiveData.redact(rs.getString("object_key")),"knowledgeBase",SensitiveData.redact(rs.getString("knowledge_base")),"score",rs.getDouble("score"),"excerpt",SensitiveData.redact(content.substring(0,Math.min(content.length(),1200))),"retrievalMode","local-keyword");
        },args.toArray());
    }
    private static String like(String term){return "%"+term.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";}
}

