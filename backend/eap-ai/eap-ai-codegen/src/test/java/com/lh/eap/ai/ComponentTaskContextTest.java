package com.lh.eap.ai;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class ComponentTaskContextTest {
 @Test void planningHasAnExplicitReadOnlyContractAndCarriesTaskRevision() {
  var context=TaskContext.parse(Map.of("mode","plan","targetPath","frontend/Page.vue","componentPaths",List.of("frontend/copy.json")));
  assertTrue(context.systemInstructions().contains("No tools are available"));
  assertFalse(context.systemInstructions().contains("Return ONLY a JSON object"));
  assertNotNull(TaskContext.parse(Map.of("mode","plan","taskRef",Map.of("projectId","p","taskId",UUID.randomUUID().toString(),"revision",1))).taskRef());
  assertThrows(RuntimeException.class,()->TaskContext.parse(Map.of("mode","agent")));
 }
 @Test void graphPathsAreExplicitBoundedAndPartOfTheModelContract() {
  var context=TaskContext.parse(Map.of("mode","code","targetPath","frontend/Page.vue","componentPaths",List.of("frontend/Summary.vue","frontend/useRows.ts")));
  assertEquals(List.of("frontend/Summary.vue","frontend/useRows.ts"),context.componentPaths());
  assertTrue(context.systemInstructions().contains("frontend/useRows.ts"));assertTrue(context.systemInstructions().contains("without cycles"));
  for(var paths:List.of(List.of("../outside.vue"),List.of("frontend/Page.vue"),List.of("frontend/X.vue","frontend/X.vue"),List.of("frontend/package.json")))
   assertThrows(RuntimeException.class,()->TaskContext.parse(Map.of("mode","code","targetPath","frontend/Page.vue","componentPaths",paths)));
  assertThrows(RuntimeException.class,()->TaskContext.parse(Map.of("mode","chat","targetPath","frontend/Page.vue","componentPaths",List.of("frontend/X.vue"))));
 }
}
