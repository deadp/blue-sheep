// Sheep voices (procedural WebAudio bleats). Pure mapping in voice.ts, synth + player in engine.ts.
export { voiceFor, bleatSeries, seriesLength, voiceHash, type Voice, type VoiceInput, type VoicePersonality, type AgeClass, type BleatStep } from "./voice.js";
export { Voices, renderBleat, renderSeries, renderOffline, type SoundRecord } from "./engine.js";
