import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { SnappassPasswords } from "./passwords";

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 1 week

const SetPasswordSchema = z
	.object({
		password: z.string().openapi({
			example: "hunter2",
		}),
		ttl: z.number().optional().default(DEFAULT_TTL).openapi({
			description: "After how many seconds should the password expire?",
		}),
	})
	.openapi("Save Password Request");

const GetPasswordSchema = z
	.object({
		uuid: z.string().openapi({
			example: "123e4567-e89b-12d3-a456-426614174000",
		}),
		key: z.string().openapi({
			example: "TBA",
		}),
	})
	.openapi("Retrieve Password Request");

const api = new OpenAPIHono<{ Bindings: Bindings }>();

// MARK: - Set Password

const set_route = createRoute({
	method: "post",
	path: "/set",
	request: {
		body: {
			content: { "application/json": { schema: SetPasswordSchema } },
			required: true,
		},
	},
	responses: {
		201: {
			content: {
				"text/json": {
					schema: z.object({
						url: z.string().openapi({
							example: "https://snappass.mastermakrela.com/get/<token>",
						}),
					}),
				},
			},
			description: "Password saved successfully. Returns link to retrieve the password.",
		},
	},
});

api.openapi(set_route, async (c) => {
	const { password, ttl } = c.req.valid("json");

	const passwords = new SnappassPasswords(c.executionCtx, c.env);
	const resp = await passwords.save(password, { ttl });
	const token = btoa(JSON.stringify(resp.key));

	const origin = new URL(c.req.url).origin;

	c.status(201);
	return c.json({ url: `${origin}/get/${token}` });
});

// MARK: - Get Password

const get_route = createRoute({
	method: "post",
	path: "/get",
	request: {
		body: {
			content: { "application/json": { schema: GetPasswordSchema } },
			required: true,
		},
	},
	responses: {
		200: {
			content: {
				"text/json": {
					schema: z.object({
						password: z.string().openapi({
							example: "hunter2",
						}),
					}),
				},
			},
			description: "Password retrieved successfully.",
		},
		404: {
			content: {
				"text/json": {
					schema: z.object({
						error: z.string().openapi({
							example: "Password not found.",
						}),
					}),
				},
			},
			description: "Password not found.",
		},
	},
});

api.openapi(get_route, async (c) => {
	const { uuid, key } = c.req.valid("json");

	const passwords = new SnappassPasswords(c.executionCtx, c.env);
	const resp = await passwords.read(uuid, key);

	if (resp === null) {
		c.status(404);
		return c.json({ error: "Password not found." });
	}

	return c.json({ password: resp.password });
});

export { api };
