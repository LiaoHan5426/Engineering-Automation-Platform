package com.lh.eap.ai;
import com.lh.eap.api.error.PlatformErrorCode;
public enum SpeechErrors implements PlatformErrorCode {
    INVALID_SPEECH_REQUEST,
    SPEECH_PAYLOAD_TOO_LARGE,
    SPEECH_OPERATION_CONFLICT,
    SPEECH_OPERATION_NOT_FOUND,
    SPEECH_CAPACITY_EXCEEDED,
    SPEECH_SERVICE_UNAVAILABLE,
    SPEECH_OPERATION_FAILED,
    SPEECH_CANCELLED;
    @Override public String code(){return name();}
}
