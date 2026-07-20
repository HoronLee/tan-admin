import { orpc } from "#/orpc/client";

export function organizationsAdminKey() {
	return orpc.organizationsAdmin.key();
}

export function organizationsAdminListQueryOptions() {
	return orpc.organizationsAdmin.list.queryOptions({ input: {} });
}
