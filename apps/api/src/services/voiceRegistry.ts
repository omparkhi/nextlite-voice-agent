export interface VoiceOption {
  id: string;
  name: string;
  provider: 'sarvam';
  gender: 'male' | 'female';
  languages: string[];
  sampleUrl?: string;
}

export const SARVAM_VOICES: VoiceOption[] = [
  { id: 'shubh', name: 'Shubh (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'aditya', name: 'Aditya (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'ashutosh', name: 'Ashutosh (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'rahul', name: 'Rahul (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'rohan', name: 'Rohan (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'amit', name: 'Amit (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'dev', name: 'Dev (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'manan', name: 'Manan (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'varun', name: 'Varun (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'ratan', name: 'Ratan (Hindi Male)', provider: 'sarvam', gender: 'male', languages: ['hi-IN', 'en-IN'] },
  { id: 'priya', name: 'Priya (Hindi Female)', provider: 'sarvam', gender: 'female', languages: ['hi-IN', 'en-IN'] },
  { id: 'neha', name: 'Neha (Hindi Female)', provider: 'sarvam', gender: 'female', languages: ['hi-IN', 'en-IN'] },
  { id: 'pooja', name: 'Pooja (Hindi Female)', provider: 'sarvam', gender: 'female', languages: ['hi-IN', 'en-IN'] },
  { id: 'simran', name: 'Simran (Hindi Female)', provider: 'sarvam', gender: 'female', languages: ['hi-IN', 'en-IN'] },
  { id: 'kavya', name: 'Kavya (Hindi Female)', provider: 'sarvam', gender: 'female', languages: ['hi-IN', 'en-IN'] },
  { id: 'ritu', name: 'Ritu (Hindi Female)', provider: 'sarvam', gender: 'female', languages: ['hi-IN', 'en-IN'] },
];

export class VoiceRegistry {
  static getVoice(voiceId: string): VoiceOption | undefined {
    return SARVAM_VOICES.find(v => v.id.toLowerCase() === voiceId.toLowerCase());
  }

  static getVoicesByGender(provider = 'sarvam', gender?: 'male' | 'female'): VoiceOption[] {
    return SARVAM_VOICES.filter(v => {
      if (v.provider !== provider) return false;
      if (gender && v.gender !== gender) return false;
      return true;
    });
  }

  static isMaleVoice(voiceId: string, explicitGender?: 'male' | 'female'): boolean {
    if (explicitGender) return explicitGender === 'male';
    const voice = this.getVoice(voiceId);
    if (voice) return voice.gender === 'male';
    return false;
  }

  isMaleVoice(voiceId: string, explicitGender?: 'male' | 'female'): boolean {
    return VoiceRegistry.isMaleVoice(voiceId, explicitGender);
  }
}

export const voiceRegistry = new VoiceRegistry();
