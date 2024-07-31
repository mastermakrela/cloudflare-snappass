import { WorkerEntrypoint } from "cloudflare:workers";
import { Buffer } from "node:buffer";

interface SavedMetadata<T> {
	/**
	 * base64 encoded initialization vector
	 */
	iv: string;
	deadline: number;
	metadata?: T;
}

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 1 week

// I don't know why WorkerEntrypoint is not working in test and I don't have time to debug it
export class SnappassPasswords<T = any> extends WorkerEntrypoint<Env> {
	// export class SnappassPasswords<T = any> {
	// env: Env;

	// constructor(ctx: ExecutionContext, env: Env) {
	// 	this.env = env;
	// }

	// MARK: - Keys

	#algo = { name: "AES-GCM", length: 256 };

	async #generateKey() {
		const key = (await crypto.subtle.generateKey(this.#algo, true, ["encrypt", "decrypt"])) as CryptoKey;

		const exported_key = (await crypto.subtle.exportKey("raw", key)) as ArrayBuffer;
		let hex_string = Array.from(new Uint8Array(exported_key))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		return { key, exported: hex_string };
	}

	async #importKey(hexString: string) {
		var length = hexString.length;
		var buffer = new Uint8Array(length / 2);

		for (var i = 0; i < length; i += 2) {
			buffer[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
		}

		const key_data = buffer.buffer;

		return crypto.subtle.importKey("raw", key_data, this.#algo, false, ["decrypt"]);
	}

	// MARK: - Encryption

	async #encrypt(key: CryptoKey, data: string) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoded = new TextEncoder().encode(data);
		const encrypted = await crypto.subtle.encrypt(
			{
				name: "AES-GCM",
				iv,
			},
			key,
			encoded
		);

		return { iv, encrypted };
	}

	async #decrypt(key: CryptoKey, iv: Uint8Array, data: ArrayBuffer) {
		const decrypted = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv,
			},
			key,
			data
		);

		return new TextDecoder().decode(decrypted);
	}

	// MARK: - Public API

	async save(
		password: string,
		rest: {
			ttl?: number;
			metadata?: T;
		} = {}
	) {
		const { ttl = DEFAULT_TTL, metadata } = rest;
		const deadline = Date.now() + ttl * 1000;

		const { key, exported } = await this.#generateKey();
		const { iv, encrypted } = await this.#encrypt(key, password);
		const uuid = crypto.randomUUID();

		await this.env.SNAPPASS.put(uuid, encrypted, {
			expirationTtl: ttl,
			metadata: {
				iv: Buffer.from(iv).toString("base64"),
				deadline: deadline,
				metadata,
			} satisfies SavedMetadata<T>,
		});

		return { uuid, key: exported };
	}

	async read(uuid: string, key: string) {
		const { value: encrypted, metadata } = await this.env.SNAPPASS.getWithMetadata<SavedMetadata<T>>(uuid, {
			type: "arrayBuffer",
		});

		// password either expired or not found
		if (!encrypted || !metadata) return null;

		// password expired, but was not removed from KV, yet
		if (Date.now() > metadata.deadline) {
			await this.env.SNAPPASS.delete(uuid);
			return null;
		}

		const iv = new Uint8Array(Buffer.from(metadata.iv, "base64"));
		const cryptoKey = await this.#importKey(key);

		const password = await this.#decrypt(cryptoKey, iv, encrypted);

		await this.env.SNAPPASS.delete(uuid);

		return { password, metadata: metadata.metadata };
	}
}
