package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.api.ProcessIdentityStatus;
import com.lh.eap.api.error.PlatformErrorCode;
import com.lh.eap.application.service.*;
import com.lh.eap.core.ExpertAgentState;
import com.lh.eap.delivery.CodeProposalStatus;
import com.lh.eap.web.i18n.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class DomainWireAndMessagesTest {
    @Test void unknownAndActivityRemainDomainSpecificAndInvalidValuesAreNotCoerced() {
        assertTrue(ToolExecutionStatus.UNKNOWN.blocking());assertFalse(ToolExecutionStatus.UNKNOWN.active());
        assertFalse(ToolExecutionStatus.CLOSED_UNKNOWN.blocking());assertTrue(CodeProposalStatus.UNKNOWN.blocking());
        assertTrue(BoardVerificationStatus.UNKNOWN.blocking());assertFalse(BoardVerificationStatus.PASSED.blocking());
        assertEquals("awaiting-approval",ExpertAgentState.AWAITING_APPROVAL.wire());
        assertEquals("running",BoardTaskColumn.RUNNING.wire());
        assertEquals("INTERRUPTED",MissionExecutionStatus.INTERRUPTED.wire());
        assertThrows(IllegalArgumentException.class, () -> new BoardRuntimeService.Activity(UUID.randomUUID(),UUID.randomUUID(),"SOURCE_WRITE","CREATED","PROPOSED"));
        assertThrows(IllegalArgumentException.class, () -> new BoardRuntimeService.Activity(UUID.randomUUID(),UUID.randomUUID(),"VERIFICATION","APPLYING","RUNNING"));
        assertThrows(IllegalArgumentException.class,()->ToolExecutionStatus.fromWire("unknown"));
        assertThrows(IllegalArgumentException.class,()->CodeProposalStatus.fromWire("UNRECOGNIZED"));
        assertThrows(IllegalArgumentException.class,()->ProcessIdentityStatus.fromWire("UNKNOWN"));
        assertThrows(IllegalArgumentException.class,()->BoardVerificationStatus.fromWire("TIMED_OUT"));
        assertEquals(BoardVerificationCheckStatus.TIMED_OUT,BoardVerificationCheckStatus.fromWire("TIMED_OUT"));
    }

    @Test void allDomainErrorsHavePairedUtf8MessagesAndGloballyUniqueKeys() throws Exception {
        var loader=getClass().getClassLoader();var allKeys=new HashSet<String>();
        for(String basename:PlatformMessagesConfiguration.PRODUCT_BASENAMES.split(",")) {
            var zh=new Properties();var en=new Properties();
            try(var input=loader.getResourceAsStream(basename+"_zh_CN.properties")) {assertNotNull(input,basename);zh.load(new java.io.InputStreamReader(input,java.nio.charset.StandardCharsets.UTF_8));}
            try(var input=loader.getResourceAsStream(basename+"_en_US.properties")) {assertNotNull(input,basename);en.load(new java.io.InputStreamReader(input,java.nio.charset.StandardCharsets.UTF_8));}
            assertEquals(zh.keySet(),en.keySet(),basename);
            for(String key:zh.stringPropertyNames()) {assertTrue(allKeys.add(key),key);assertFalse(zh.getProperty(key).isBlank());assertFalse(en.getProperty(key).isBlank());assertFalse(zh.getProperty(key).contains("\uFFFD"));}
        }
        var source=PlatformMessagesConfiguration.source(PlatformMessagesConfiguration.PRODUCT_BASENAMES);
        for(String name:List.of("Common","Code","Board","BoardDelivery","BoardVerification","Tool","Agent","Model","Mcp","Skill","Resource","Workspace","Security","Protocol","Execution","CliProgram","Git","Chat","ChatGptAuth","Knowledge","Database","Rule","Mission")) {
            for(Object constant:Class.forName("com.lh.eap.error."+name+"Errors").getEnumConstants()) {
                String code=((PlatformErrorCode)constant).code(),key="errors."+code;
                assertTrue(allKeys.contains(key),key);
                String zh=source.getMessage(key,new Object[]{48000},Locale.SIMPLIFIED_CHINESE),en=source.getMessage(key,new Object[]{48000},Locale.US);
                assertNotEquals(zh,en,key);assertFalse(zh.contains(code),key);assertFalse(en.contains(code),key);
            }
        }
    }
}
