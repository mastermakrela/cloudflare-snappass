// Generated by Wrangler
// After adding bindings to `wrangler.toml`, regenerate this interface via `npm run cf-typegen`
interface CloudflareBindings {
	SNAPPASS: KVNamespace;
	SNAPPASS_LINKS: KVNamespace;
}

type Bindings = Record<string, unknown> & CloudflareBindings;
type Env = CloudflareBindings;

declare module "*.html" {
	const content: string;
	export default content;
}
