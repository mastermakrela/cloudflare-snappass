import { OpenAPIHono } from "@hono/zod-openapi";
import { api } from "./schemas";
import { swaggerUI } from "@hono/swagger-ui";

import styles from "./output.css";

import homepage from "./html/index.html";
import create from "./html/create.html";
import error from "./html/error.html";

const app = new OpenAPIHono<{ Bindings: Bindings }>();

declare module "hono" {
	interface ContextRenderer {
		(content: string): Response | Promise<Response>;
	}
}

// MARK: - Middleware

app.use(async (c, next) => {
	c.setRenderer((content) => {
		return c.html(homepage.replace("%content%", content));
	});
	await next();
});

// MARK: - Assets

app.get("/output.css", (c) => {
	c.header("Content-Type", "text/css");
	return c.body(styles);
});

// MARK: - Save password

app.get("/", (c) => {
	return c.render(create);
});

app.post("/", async (c) => {
	const form_data = await c.req.formData();

	const password = form_data.get("password") as string;
	const ttl = parseInt(form_data.get("ttl") as string);

	if (!password || !ttl) {
		return c.render(error.replace("%message%", "Please fill in all fields."));
	}

	return c.render(`
	Saved sucessfully! <br>
	<a href='/'>Go back</a>
	`);
});

// MARK: - Get password

app.get("/get/:token", (c) => {
	const token = c.req.param("token");

	if (!token) {
		return c.text("invalid token");
	}

	return c.text("get");
});

// MARK: - API Docs

app.route("/api", api);

app.doc("/api/doc", {
	openapi: "3.0.0",
	info: {
		version: "1.0.0",
		title: "Cloudflare Snappass API",
	},
});

app.get("/api", swaggerUI({ url: "/api/doc" }));

export default app;
