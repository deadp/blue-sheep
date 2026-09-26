// Sheep voices (procedural WebAudio bleats). Pure mapping in voice.ts, synth + player in engine.ts.
export { voiceFor, petVoiceFor, bleatSeries, seriesLength, voiceHash, type Voice, type VoiceInput, type VoicePersonality, type AgeClass, type BleatStep, type PetVoiceKind } from "./voice.js";
export { Voices, renderBleat, renderSeries, renderOffline, type SoundRecord } from "./engine.js";
