package com.lh.eap.application.service;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PrototypePublicationServiceTest {
    static final String BODY="""
        {"format":"eap-prototype-v1","schema":{"version":1,"title":"Design","unknownMappings":[],"grapesProject":{},
        "root":{"id":"root","kind":"page","props":{},"children":[{"id":"button","kind":"button","props":{"label":"Send"},"children":[]}]}}}
        """;
    static class Store implements PrototypeVersionStore {
        final ConcurrentMap<UUID,PrototypeVersion> rows=new ConcurrentHashMap<>();
        public void insert(PrototypeVersion version){rows.putIfAbsent(version.requestId(),version);}
        public Optional<PrototypeVersion> request(UUID request){return Optional.ofNullable(rows.get(request));}
        public Optional<PrototypeVersion> find(UUID id){return rows.values().stream().filter(row->row.id().equals(id)).findFirst();}
        public List<PrototypeVersion> list(String source){return rows.values().stream().filter(row->row.sourceRef().equals(source)).toList();}
    }
    final Store store=new Store();final PrototypeVersionService service=new PrototypeVersionService(store,null);
    @Test void lostResponseCanBeReadWithoutRepeatingPublication() {
        var request=UUID.randomUUID();var first=service.save(request,"builder-alpha","Design",BODY,List.of("preview"));
        assertEquals(first,service.publication(request));assertEquals(1,store.rows.size());
        assertEquals(first,service.save(request,"builder-alpha"," Design ",BODY,List.of(" preview ")));
        assertEquals(1,store.rows.size());
    }
    @Test void sameIdentityWithChangedContentOrInstanceCannotCreateAnotherVersion() {
        var request=UUID.randomUUID();var first=service.save(request,"builder-alpha","Design",BODY,List.of());
        for(var source:List.of("builder-alpha","builder-beta")) {
            var failure=assertThrows(ResponseStatusException.class,()->service.save(request,source,"Changed",BODY,List.of()));
            assertEquals(409,failure.getStatusCode().value());
        }
        assertEquals(first,service.publication(request));assertEquals(1,store.rows.size());
    }
    @Test void concurrentSameRequestReturnsOneImmutableVersion() throws Exception {
        var request=UUID.randomUUID();
        try(var workers=Executors.newVirtualThreadPerTaskExecutor()) {
            var futures=new ArrayList<Future<PrototypeVersion>>();
            for(int i=0;i<16;i++)futures.add(workers.submit(()->service.save(request,"builder-alpha","Design",BODY,List.of())));
            var selected=futures.getFirst().get();for(var result:futures)assertEquals(selected,result.get());
        }
        assertEquals(1,store.rows.size());
    }
    @Test void absentQueryAndMissingIdentityNeverPublish() {
        assertEquals(404,assertThrows(ResponseStatusException.class,()->service.publication(UUID.randomUUID())).getStatusCode().value());
        assertEquals(400,assertThrows(ResponseStatusException.class,()->service.save(null,"builder-alpha","Design",BODY,List.of())).getStatusCode().value());
        assertTrue(store.rows.isEmpty());
    }
    @Test void aNewExplicitIdentityCreatesANewVersionWithoutChangingTheOldHash() {
        var first=service.save(UUID.randomUUID(),"builder-alpha","Design",BODY,List.of());
        var second=service.save(UUID.randomUUID(),"builder-alpha","Design",BODY,List.of());
        assertNotEquals(first.id(),second.id());assertEquals(first.contentHash(),second.contentHash());
        assertEquals(first,service.find(first.id()));assertEquals(2,store.rows.size());
    }
}
