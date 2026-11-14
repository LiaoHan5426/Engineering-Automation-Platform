<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button, Feedback, Select } from '@eap/ui'
import type { useChatAudio } from './useChatAudio'
defineProps<{ audio: ReturnType<typeof useChatAudio>; disabled?: boolean }>()
const emit = defineEmits<{ configure: [] }>()
const { t, te } = useI18n({
  useScope: 'local',
  messages: {
    'zh-CN': {
      title: '语音',
      speech: {
        audioLimit: '音频超过允许大小，请缩短录音。',
        recordingFailed: '录音失败，请检查麦克风权限。',
        invalidOperation: '语音请求结果不匹配，请重新检查结果。',
        transcriptLimit: '识别文本超过允许长度。',
        invalidAudio: '返回的音频格式或大小无效。',
        failed: '语音处理失败，请检查服务配置。',
        playbackFailed: '音频播放失败，请检查浏览器播放权限。',
      },
      choose: '选择语音服务',
      configure: '语音设置',
      unavailable: '尚未配置可用语音服务。',
      record: '开始录音（将请求麦克风权限）',
      stop: '停止录音',
      transcribe: '转录到草稿',
      discard: '丢弃录音',
      append: '追加识别文本',
      changed: '草稿已变化，请确认是否追加识别结果。',
      unsupported: '此浏览器不支持录音。',
      recover: '检查语音请求结果',
      cancel: '请求取消',
      play: '播放生成的语音',
      stopPlay: '停止播放',
    },
    'en-US': {
      title: 'Speech',
      speech: {
        audioLimit: 'Audio exceeds the size limit. Record a shorter clip.',
        recordingFailed: 'Recording failed. Check microphone permissions.',
        invalidOperation:
          'The speech response does not match this request. Check the result again.',
        transcriptLimit: 'The transcript exceeds the text limit.',
        invalidAudio: 'The returned audio format or size is invalid.',
        failed: 'Speech processing failed. Check service configuration.',
        playbackFailed: 'Audio playback failed. Check browser playback permissions.',
      },
      choose: 'Choose a speech service',
      configure: 'Speech settings',
      unavailable: 'No speech service is configured and available.',
      record: 'Start recording (requests microphone access)',
      stop: 'Stop recording',
      transcribe: 'Transcribe into draft',
      discard: 'Discard recording',
      append: 'Append transcript',
      changed: 'The draft changed. Review the transcript before appending.',
      unsupported: 'Recording is unavailable in this browser.',
      recover: 'Check speech request result',
      cancel: 'Request cancellation',
      play: 'Play generated speech',
      stopPlay: 'Stop playback',
    },
  },
})
</script>
<template>
  <section class="speech-controls" data-testid="speech-controls" :aria-label="t('title')">
    <div class="speech-toolbar">
      <Button variant="ghost" size="sm" @click="emit('configure')">{{ t('configure') }}</Button>
      <Select
        v-model="audio.serviceId.value"
        :disabled="
          disabled ||
          audio.busy.value ||
          audio.microphone.value !== 'idle' ||
          !audio.catalog.value?.services.length
        "
        :aria-label="t('choose')"
      >
        <option value="">{{ t('choose') }}</option>
        <option
          v-for="service in audio.catalog.value?.services"
          :key="service.serverId"
          :value="service.serverId"
        >
          {{ service.serverId }}
        </option>
      </Select>
      <Button
        v-if="audio.microphone.value === 'idle'"
        variant="secondary"
        size="sm"
        :disabled="
          disabled ||
          audio.busy.value ||
          !audio.recorderAvailable ||
          !audio.selectedService.value?.transcription
        "
        @click="audio.startRecording"
        >{{ t('record') }}</Button
      >
      <Button
        v-else
        variant="secondary"
        size="sm"
        :disabled="audio.microphone.value === 'stopping'"
        @click="audio.stopRecording"
        >{{ t('stop') }}</Button
      >
    </div>
    <p v-if="!audio.catalog.value?.services.length">{{ t('unavailable') }}</p>
    <p v-else-if="!audio.recorderAvailable">{{ t('unsupported') }}</p>
    <template v-if="audio.recordingUrl.value">
      <audio :src="audio.recordingUrl.value" controls preload="none" />
      <Button size="sm" :disabled="disabled || audio.busy.value" @click="audio.transcribe">{{
        t('transcribe')
      }}</Button>
      <Button
        variant="ghost"
        size="sm"
        :disabled="audio.busy.value"
        @click="audio.clearRecording"
        >{{ t('discard') }}</Button
      >
    </template>
    <Feedback v-if="audio.error.value" tone="warning">{{
      te(audio.error.value) ? t(audio.error.value) : audio.error.value
    }}</Feedback>
    <div v-if="audio.pendingText.value">
      <p>{{ t('changed') }}</p>
      <pre>{{ audio.pendingText.value }}</pre>
      <Button :disabled="disabled" size="sm" @click="audio.appendTranscript">{{
        t('append')
      }}</Button>
    </div>
    <div v-if="audio.operation.value?.status === 'RUNNING'">
      <Button variant="secondary" size="sm" :disabled="audio.busy.value" @click="audio.recover">{{
        t('recover')
      }}</Button
      ><Button variant="ghost" size="sm" @click="audio.cancel">{{ t('cancel') }}</Button>
    </div>
    <template v-if="audio.playbackUrl.value"
      ><Button v-if="!audio.playing.value" size="sm" @click="audio.play">{{ t('play') }}</Button
      ><Button v-else variant="secondary" size="sm" @click="audio.stopPlayback">{{
        t('stopPlay')
      }}</Button></template
    >
  </section>
</template>
<style scoped>
.speech-toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.speech-toolbar :deep(select) {
  flex: 1 1 10rem;
  min-width: 0;
  max-width: 100%;
}
.speech-controls {
  font-size: 0.8rem;
}
.speech-controls audio {
  width: 100%;
}
.speech-controls pre {
  white-space: pre-wrap;
  max-height: 10rem;
  overflow: auto;
}
</style>
