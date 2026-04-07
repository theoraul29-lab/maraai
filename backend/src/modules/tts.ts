import type { Request, Response } from 'express';

let voiceMap: Record<string, string> = {};
let importAudioClient: (() => Promise<any>) | null = null;

export function injectDeps(d: Record<string, any>) {
  const { importAudioClient: iac, ...voices } = d;
  voiceMap = voices;
  importAudioClient = iac;
}

export async function maraSpeak(req: Request, res: Response) {
  try {
    const { text, personality } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ message: 'Text is required' });
    }
    const voice = voiceMap[personality || 'friendly'] || 'shimmer';

    if (!importAudioClient) {
      return res.status(503).json({ message: 'Audio service not available' });
    }

    try {
      const audioModule = await importAudioClient();
      const audio = await audioModule.synthesizeSpeech(text, voice);
      res.json({ audio, voice });
    } catch {
      res.status(503).json({ message: 'Audio synthesis unavailable' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate speech' });
  }
}

export async function tts(req: Request, res: Response) {
  try {
    const { text, voice } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ message: 'Text is required' });
    }

    if (!importAudioClient) {
      return res.status(503).json({ message: 'Audio service not available' });
    }

    try {
      const audioModule = await importAudioClient();
      const audio = await audioModule.synthesizeSpeech(text, voice || 'nova');
      res.json({ audio });
    } catch {
      res.status(503).json({ message: 'TTS service unavailable' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate speech' });
  }
}
