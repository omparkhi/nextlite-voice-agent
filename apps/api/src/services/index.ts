import { createEmbeddingService } from './embedding.js';
import { createStorageService } from './storage.js';
import { createLLMService } from './llm.js';
import { createKnowledgeService } from './knowledge.js';
import { createTestConversationService } from './test-conversation.js';
import { createConfigAssistantService } from './config-assistant.js';
import { createVoiceRuntime } from '../voice/index.js';
import { createSarvamSTTAdapter } from '../voice/providers/sarvam/index.js';
import { createSarvamTTSAdapter } from '../voice/providers/sarvam/index.js';
import { env } from '../config/env.js';

let _embeddingService: ReturnType<typeof createEmbeddingService> | null = null;
let _storageService: ReturnType<typeof createStorageService> | null = null;
let _llmService: ReturnType<typeof createLLMService> | null = null;
let _knowledgeService: ReturnType<typeof createKnowledgeService> | null = null;
let _testConversationService: ReturnType<typeof createTestConversationService> | null = null;
let _configAssistantService: ReturnType<typeof createConfigAssistantService> | null = null;
let _voiceRuntime: ReturnType<typeof createVoiceRuntime> | null = null;

function getEmbeddingService() {
  if (!_embeddingService) _embeddingService = createEmbeddingService();
  return _embeddingService;
}

function getStorageService() {
  if (!_storageService) _storageService = createStorageService();
  return _storageService;
}

function getLLMService() {
  if (!_llmService) _llmService = createLLMService();
  return _llmService;
}

export function getKnowledgeService() {
  if (!_knowledgeService) {
    _knowledgeService = createKnowledgeService(getStorageService(), getEmbeddingService());
  }
  return _knowledgeService;
}

export function getTestConversationService() {
  if (!_testConversationService) {
    _testConversationService = createTestConversationService(getLLMService(), getKnowledgeService());
  }
  return _testConversationService;
}

export function getConfigAssistantService() {
  if (!_configAssistantService) {
    _configAssistantService = createConfigAssistantService(getLLMService());
  }
  return _configAssistantService;
}

export function getVoiceRuntime() {
  if (!_voiceRuntime) {
    const apiKey = env.SARVAM_API_KEY ?? '';
    _voiceRuntime = createVoiceRuntime(getLLMService(), getKnowledgeService(), {
      createSTT: () => createSarvamSTTAdapter(apiKey),
      createTTS: () => createSarvamTTSAdapter(apiKey),
    });
  }
  return _voiceRuntime;
}
