import type { Request, Response } from 'express';

let importAudioClient: (() => Promise<any>) | null = null;

export function injectDeps(d: { importAudioClient: () => Promise<any> }) {
  importAudioClient = d.importAudioClient;
}

export async function stt(req: Request, res: Response) {
  try {
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ message: 'Audio data is required' });
    }

    if (!importAudioClient) {
      return res.status(503).json({ message: 'Audio service not available' });
    }

    try {
      const audioModule = await importAudioClient();
      const text = await audioModule.transcribeSpeech(audio);
      res.json({ text });
    } catch {
      res.status(503).json({ message: 'STT service unavailable' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to transcribe audio' });
  }
}
