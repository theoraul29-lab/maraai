import { setGlobalOptions } from 'firebase-functions';
import { onRequest } from 'firebase-functions/https';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Datastore } from '@google-cloud/datastore';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleGenerativeAI } from '@google/generative-ai';

setGlobalOptions({ maxInstances: 10 });

initializeApp();
const datastore = new Datastore();
const app = express();
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const vertexLocation = process.env.VERTEX_LOCATION || 'us-central1';
const geminiModel = process.env.GEMINI_MODEL_NAME || 'gemini-3.1-pro-preview';
const vertexLocationCandidates = [vertexLocation, 'global', 'us-central1']
	.filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
const vertexModelCandidates = [
	process.env.VERTEX_MODEL_NAME || geminiModel,
	geminiModel,
	'gemini-1.5-flash-002',
	'gemini-2.0-flash-001',
].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

// Augment Express Request so all route handlers accept req.user naturally
declare global {
	namespace Express {
		interface Request {
			user?: {
				uid: string;
				email?: string | null;
			};
		}
	}
}

type AuthenticatedRequest = Request;

type ChatHistoryItem = {
	role: 'user' | 'assistant';
	parts: { text: string }[];
};

type StoredChatMessage = {
	createdAt: number;
	role: 'user' | 'assistant';
	parts: { text: string }[];
};

type FeedPost = {
	id: string;
	user?: string;
	content?: string;
	media?: string;
	likes?: number;
	time?: string;
};

type ReelItem = {
	id: string;
	author?: string;
	caption?: string;
	videoUrl?: string;
	audioName?: string;
	likes?: string;
	createdAt?: number;
};

type WriterLibraryItem = {
	id: string;
	title?: string;
	content?: string;
	author?: string;
	genre?: string;
	likes?: number;
	comments?: unknown[];
	createdAt?: number;
};

const genAI = process.env.GEMINI_API_KEY
	? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
	: null;

const firebaseWebApiKey =
	process.env.FIREBASE_WEB_API_KEY
	|| process.env.FIREBASE_API_KEY
	|| process.env.VITE_FIREBASE_API_KEY
	|| '';

function buildVertexClient(location: string): VertexAI | null {
	if (!projectId) {
		return null;
	}

	return new VertexAI({ project: projectId, location });
}

const SAMPLE_POSTS = [
	{
		user: 'mara_core',
		content: 'Bun venit in feed-ul MaraAI din Firebase. Aici poti centraliza continutul comunitatii si recomandarile AI.',
		media: '',
		likes: 12,
		time: new Date().toISOString(),
	},
	{
		user: 'creator_lab',
		content: 'Un singur backend Firebase poate alimenta feed, reels, chat si biblioteca de texte fara drift operational.',
		media: '',
		likes: 8,
		time: new Date().toISOString(),
	},
];

const SAMPLE_REELS = [
	{
		author: 'MARA_CORE',
		caption: 'MaraAI ruleaza acum pe Firebase Functions + Datastore.',
		videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
		audioName: 'Mara Original',
		likes: '150',
		createdAt: Date.now(),
	},
	{
		author: 'BuildersHub',
		caption: 'Reels, feed si chat in acelasi ecosistem Firebase.',
		videoUrl: 'https://www.w3schools.com/html/movie.mp4',
		audioName: 'Original Audio',
		likes: '82',
		createdAt: Date.now() - 1,
	},
];

const SYSTEM_PROMPT = `Esti MaraAI, un copilot cald, precis si strategic.
Raspunzi concis, clar si orientat pe actiune.
Cand utilizatorul cere ajutor creativ, esti inspirata.
Cand utilizatorul cere ajutor tehnic, esti structurata si exacta.
Nu inventa capabilitati si nu promite actiuni pe care nu le poti executa.`;

app.use(cors({ origin: ['https://maraai.net', 'https://maraai-488fb.web.app', 'https://maraai-488fb.firebaseapp.com'] }));
app.use(express.json({ limit: '1mb' }));

const authMiddleware = async (
	req: AuthenticatedRequest,
	_res: Response,
	next: NextFunction,
): Promise<void> => {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith('Bearer ')) {
		next();
		return;
	}

	try {
		const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
		req.user = {
			uid: decoded.uid,
			email: decoded.email ?? null,
		};
	} catch (_error) {
		// Invalid token falls back to anonymous access for public modules.
	}

	next();
};

app.use(authMiddleware);

function buildUserKey(req: AuthenticatedRequest): string {
	const fromBody = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
	const fromQuery = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
	return req.user?.uid || fromBody || fromQuery || 'anonymous';
}

function entityId(entity: Record<string, unknown>): string {
	const key = Reflect.get(entity, datastore.KEY as unknown as PropertyKey) as
		| { id?: string | number; name?: string }
		| undefined;
	return String(key?.name ?? key?.id ?? '');
}

function clampDatastoreText(value: string, maxBytes = 1400): string {
	if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
		return value;
	}

	let result = value;
	while (Buffer.byteLength(result, 'utf8') > maxBytes && result.length > 0) {
		result = result.slice(0, -1);
	}

	return result;
}

async function listEntities<T extends Record<string, unknown>>(
	kind: string,
	limit: number,
): Promise<T[]> {
	const query = datastore.createQuery(kind).limit(limit);
	const [rows] = await datastore.runQuery(query);
	return rows as T[];
}

async function seedKindIfEmpty<T extends Record<string, unknown>>(
	kind: string,
	seedRows: T[],
): Promise<void> {
	const existing = await listEntities(kind, 1);
	if (existing.length > 0 || seedRows.length === 0) {
		return;
	}

	for (const row of seedRows) {
		await datastore.save({
			key: datastore.key([kind]),
			data: row,
		});
	}
}

async function saveEntity<T extends Record<string, unknown>>(kind: string, data: T): Promise<T & { id: string }> {
	const key = datastore.key([kind]);
	await datastore.save({ key, data });
	return {
		id: String(key.id ?? key.name ?? ''),
		...data,
	};
}

async function generateMaraReply(
	message: string,
	history: ChatHistoryItem[],
	overrides?: { systemPrompt?: string },
): Promise<string> {
	const systemPrompt = overrides?.systemPrompt || SYSTEM_PROMPT;

	if (genAI) {
		try {
			const model = genAI.getGenerativeModel({
				model: geminiModel,
				systemInstruction: systemPrompt,
				generationConfig: { temperature: 0.8 },
			});

			const chat = model.startChat({
				history: history.map((item) => ({
					role: item.role === 'user' ? 'user' : 'model',
					parts: item.parts,
				})),
			});

			const result = await chat.sendMessage(message);
			return result.response.text().trim();
		} catch (error) {
			console.error('Gemini API key request failed, falling back to Vertex AI', error);
		}
	}

	for (const location of vertexLocationCandidates) {
		const vertexAI = buildVertexClient(location);
		if (!vertexAI) {
			continue;
		}

		for (const modelName of vertexModelCandidates) {
			try {
				const model = vertexAI.getGenerativeModel({
					model: modelName,
					systemInstruction: {
						role: 'system',
						parts: [{ text: systemPrompt }],
					},
					generationConfig: { temperature: 0.8 },
				});

				const chat = model.startChat({
					history: history.map((item) => ({
						role: item.role === 'user' ? 'user' : 'model',
						parts: item.parts,
					})),
				});

				const result = await chat.sendMessage(message);
				return result.response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim()
					|| 'MaraAI nu a putut genera un raspuns valid.';
			} catch (error) {
				console.error(`Vertex chat request failed for location ${location} and model ${modelName}`, error);
			}
		}
	}

	return `MaraAI: ${message}`;
}

async function generateTradingContent(): Promise<string> {
	const prompt = 'Analizeaza BTC si ETH pe scurt, educational, in romana. Mentioneaza directia pietei, riscul si un sfat de risk management in maximum 4 propozitii.';

	return generateMaraReply(prompt, [], {
		systemPrompt: 'Esti MaraAI, un analist de piata prudent si clar. Raspunzi in romana, concis, educational, fara promisiuni financiare si fara limbaj vag.',
	});
}

async function verifyFirebaseEmailPassword(email: string, password: string): Promise<string> {
	if (!firebaseWebApiKey) {
		throw new Error('Missing Firebase Web API key for password login');
	}

	const response = await fetch(
		`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseWebApiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				password,
				returnSecureToken: true,
			}),
		},
	);

	if (!response.ok) {
		const payload = await response.json().catch(() => ({} as Record<string, unknown>));
		const message = String((payload as { error?: { message?: string } }).error?.message || 'INVALID_LOGIN');
		throw new Error(message);
	}

	const payload = await response.json() as { idToken?: string };
	if (!payload.idToken) {
		throw new Error('Missing idToken from Firebase Auth');
	}

	return payload.idToken;
}

async function handleChatRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
	const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
	const incomingHistory = Array.isArray(req.body?.history) ? (req.body.history as ChatHistoryItem[]) : [];
	const userId = buildUserKey(req);

	if (!message) {
		res.status(400).json({ error: 'message este obligatoriu.' });
		return;
	}

	try {
		const query = datastore.createQuery('ChatMessage').filter('userId', '=', userId).limit(20);
		const [savedRows] = await datastore.runQuery(query);

		const savedHistory: ChatHistoryItem[] = (savedRows as Array<Record<string, unknown>>)
			.map((row) => ({
				createdAt: Number(row.createdAt || 0),
				role: (row.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
				parts: [{ text: String(row.text || '') }],
			}) as StoredChatMessage)
			.sort((left, right) => left.createdAt - right.createdAt)
			.map(({ role, parts }) => ({ role, parts }));

		const history = [...savedHistory, ...incomingHistory].slice(-20);
		const reply = await generateMaraReply(message, history);

		await datastore.save({
			key: datastore.key(['ChatMessage']),
			data: {
				userId,
			role: 'user',
			text: clampDatastoreText(message),
			createdAt: Date.now(),
			},
		});
		await datastore.save({
			key: datastore.key(['ChatMessage']),
			data: {
				userId,
			role: 'assistant',
			text: clampDatastoreText(reply),
			createdAt: Date.now() + 1,
			},
		});

		res.status(200).json({
			reply,
			history: [
				...history,
				{ role: 'user', parts: [{ text: message }] },
				{ role: 'assistant', parts: [{ text: reply }] },
			].slice(-20),
		});
	} catch (error) {
		console.error('POST /api/chat failed', error);
		res.status(500).json({ error: 'Chat MaraAI este temporar indisponibil.' });
	}
}

/* ===== AUTH ENDPOINTS ===== */

app.post('/api/auth/signup', async (req: Request, res: Response) => {
	try {
		const { email, password, name } = req.body;

		if (!email || !password || !name) {
			res.status(400).json({ error: 'Email, password, and name are required' });
			return;
		}

		// Create Firebase Auth user
		const userRecord = await getAuth().createUser({
			email,
			password,
			displayName: name,
		});

		// Create user in Datastore with trial tier
		const trialEndsAt = Date.now() + 60 * 60 * 1000; // 1 hour from now
		await datastore.save({
			key: datastore.key(['User', userRecord.uid]),
			data: {
				uid: userRecord.uid,
				email,
				name,
				tier: 'trial',
				trialStartTime: Date.now(),
				trialEndsAt: trialEndsAt,
				createdAt: Date.now(),
				earnings: 0,
				badges: [],
			},
		});

		res.status(200).json({
			id: userRecord.uid,
			email,
			name,
			tier: 'trial',
			earnings: 0,
			badges: [],
		});
	} catch (error) {
		console.error('Auth signup failed:', error);
		res.status(500).json({ error: 'Signup failed' });
	}
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			res.status(400).json({ error: 'Email and password are required' });
			return;
		}

		const idToken = await verifyFirebaseEmailPassword(email, password);
		const decoded = await getAuth().verifyIdToken(idToken);

		const key = datastore.key(['User', decoded.uid]);
		const [existingUser] = await datastore.get(key);
		const user = existingUser || {
			uid: decoded.uid,
			email: decoded.email || email,
			name: decoded.name || email.split('@')[0],
			tier: 'trial',
			earnings: 0,
			badges: [],
			createdAt: Date.now(),
		};

		if (!existingUser) {
			await datastore.save({ key, data: user });
		}

		res.status(200).json({
			id: user.uid,
			email: user.email,
			name: user.name,
			tier: user.tier,
			earnings: user.earnings || 0,
			badges: user.badges || [],
			idToken,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Login failed';
		if (message.includes('INVALID_PASSWORD') || message.includes('EMAIL_NOT_FOUND') || message.includes('INVALID_LOGIN_CREDENTIALS')) {
			res.status(401).json({ error: 'Invalid credentials' });
			return;
		}
		console.error('Auth login failed:', error);
		res.status(500).json({ error: 'Login failed' });
	}
});

app.post('/api/auth/oauth/:provider', async (req: Request, res: Response) => {
	try {
		const { provider } = req.params;
		// Placeholder for OAuth - real implementation would use Google/Facebook SDKs
		const userId = `${provider}_${Date.now()}`;

		res.status(200).json({
			id: userId,
			email: `user@${provider}.local`,
			name: `${provider} User`,
			tier: 'trial',
			earnings: 0,
			badges: [],
		});
	} catch (error) {
		console.error('OAuth failed:', error);
		res.status(500).json({ error: 'OAuth failed' });
	}
});

app.post('/api/user/upgrade', async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { userId, newTier } = req.body;

		if (!req.user?.uid) {
			res.status(401).json({ error: 'Authentication required' });
			return;
		}

		if (!userId || userId !== req.user.uid) {
			res.status(403).json({ error: 'Forbidden tier update target' });
			return;
		}

		if (!['premium', 'vip'].includes(newTier)) {
			res.status(400).json({ error: 'Invalid tier' });
			return;
		}

		const key = datastore.key(['User', userId]);
		const [user] = await datastore.get(key);

		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		await datastore.save({
			key,
			data: {
				...user,
				tier: newTier,
			},
		});

		res.status(200).json({ tier: newTier });
	} catch (error) {
		console.error('User upgrade failed:', error);
		res.status(500).json({ error: 'Upgrade failed' });
	}
});

app.get('/api/health', (_req: Request, res: Response) => {
	res.status(200).json({
		status: 'ok',
		provider: 'firebase-functions',
		persistence: 'datastore',
		aiConfigured: Boolean(process.env.GEMINI_API_KEY),
		aiModel: geminiModel,
	});
});

app.get('/api/posts', async (_req: Request, res: Response) => {
	try {
		await seedKindIfEmpty('Post', SAMPLE_POSTS);
		const posts: FeedPost[] = (await listEntities<Record<string, unknown>>('Post', 50))
			.map((row) => ({ id: entityId(row), ...row } as FeedPost))
			.sort((left, right) => String(right.time || '').localeCompare(String(left.time || '')));
		res.status(200).json(posts);
	} catch (error) {
		console.error('GET /api/posts failed', error);
		res.status(500).json([]);
	}
});

app.post('/api/posts', async (req: AuthenticatedRequest, res: Response) => {
	const payload = req.body || {};
	const user = typeof payload.user === 'string' && payload.user.trim() ? payload.user.trim() : req.user?.email || 'anonymous';
	const content = typeof payload.content === 'string' ? payload.content.trim() : '';
	const media = typeof payload.media === 'string' ? payload.media.trim() : '';

	if (!content && !media) {
		res.status(400).json({ error: 'content sau media este obligatoriu.' });
		return;
	}

	const post = {
		user,
		content,
		media,
		likes: 0,
		time: new Date().toISOString(),
	};

	try {
		res.status(201).json(await saveEntity('Post', post));
	} catch (error) {
		console.error('POST /api/posts failed', error);
		res.status(500).json({ error: 'Postarea a esuat.' });
	}
});

// POST /api/posts/:id/like - Like/Unlike a post
app.post('/api/posts/:id/like', async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { id } = req.params;
		const key = datastore.key(['Post', id]);
		const [post] = await datastore.get(key);

		if (!post) {
			res.status(404).json({ error: 'Post not found' });
			return;
		}

		const likes = Number(post.likes || 0);
		await datastore.save({
			key,
			data: {
				...post,
				likes: likes + 1,
			},
		});

		res.status(200).json({ likes: likes + 1 });
	} catch (error) {
		console.error('POST /api/posts/:id/like failed', error);
		res.status(500).json({ error: 'Failed to like post' });
	}
});

// POST /api/posts/:id/comment - Comment on a post
app.post('/api/posts/:id/comment', async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { id } = req.params;
		const { text } = req.body;

		if (!text || !text.trim()) {
			res.status(400).json({ error: 'Comment text is required' });
			return;
		}

		const comment = {
			postId: id,
			userId: req.user?.uid || 'anonymous',
			author: req.user?.email || 'Anonymous',
			text: String(text).trim(),
			createdAt: Date.now(),
		};

		const result = await saveEntity('Comment', comment);
		res.status(201).json(result);
	} catch (error) {
		console.error('POST /api/posts/:id/comment failed', error);
		res.status(500).json({ error: 'Failed to post comment' });
	}
});

app.get('/api/reels', async (_req: Request, res: Response) => {
	try {
		await seedKindIfEmpty('Reel', SAMPLE_REELS);
		const reels: ReelItem[] = (await listEntities<Record<string, unknown>>('Reel', 50))
			.map((row) => ({ id: entityId(row), ...row } as ReelItem))
			.sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
		res.status(200).json(reels);
	} catch (error) {
		console.error('GET /api/reels failed', error);
		res.status(500).json([]);
	}
});

app.get('/api/trading/signals', async (_req: Request, res: Response) => {
	if (!genAI && !projectId) {
		res.status(200).json({
			module: 'trading',
			content: 'Semnal fallback: piața este volatilă. Așteaptă confirmare pe volum și păstrează risk management strict.',
			timestamp: new Date().toISOString(),
		});
		return;
	}

	try {
		res.status(200).json({
			module: 'trading',
			content: await generateTradingContent(),
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error('GET /api/trading/signals failed', error);
		res.status(200).json({
			module: 'trading',
			content: 'Semnal fallback: datele live AI sunt temporar indisponibile. Foloseste confirmari multiple inainte de intrare.',
			timestamp: new Date().toISOString(),
		});
	}
});

app.get('/api/writers/library', async (_req: Request, res: Response) => {
	try {
		const rows: WriterLibraryItem[] = (await listEntities<Record<string, unknown>>('WriterLibrary', 50))
			.map((row) => ({ id: entityId(row), ...row } as WriterLibraryItem))
			.sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
		res.status(200).json(rows);
	} catch (error) {
		console.error('GET /api/writers/library failed', error);
		res.status(503).json([]);
	}
});

app.post('/api/writers/publish', async (req: AuthenticatedRequest, res: Response) => {
	const payload = req.body || {};
	const title = typeof payload.title === 'string' ? payload.title.trim() : '';
	const content = typeof payload.content === 'string' ? payload.content.trim() : '';
	const author = typeof payload.author === 'string' && payload.author.trim()
		? payload.author.trim()
		: req.user?.email || 'Mara';
	const genre = typeof payload.genre === 'string' ? payload.genre.trim() : 'Fictiune';

	if (!title || !content) {
		res.status(400).json({ error: 'title si content sunt obligatorii.' });
		return;
	}

	const doc = {
		title,
		content,
		author,
		genre,
		likes: 0,
		comments: [],
		createdAt: Date.now(),
	};

	try {
		res.status(201).json(await saveEntity('WriterLibrary', doc));
	} catch (error) {
		console.error('POST /api/writers/publish failed', error);
		res.status(500).json({ error: 'Publicarea a esuat.' });
	}
});

app.get('/api/user/vip-status', async (req: AuthenticatedRequest, res: Response) => {
	const userId = buildUserKey(req);
	if (userId === 'anonymous') {
		res.status(200).json({ isPremium: false });
		return;
	}

	try {
		const key = datastore.key(['Membership', userId]);
		const [membership] = await datastore.get(key);
		res.status(200).json({ isPremium: membership?.isPremium === true });
	} catch (error) {
		console.error('GET /api/user/vip-status failed', error);
		res.status(200).json({ isPremium: false });
	}
});

app.post('/api/chat', handleChatRequest);

app.post('/api/ai', async (req: AuthenticatedRequest, res: Response) => {
	await handleChatRequest(req, res);
});

export const api = onRequest({
	region: 'europe-west1',
	secrets: ['GEMINI_API_KEY'],
	serviceAccount: 'vertex-express@maraai-488fb.iam.gserviceaccount.com',
}, app);
