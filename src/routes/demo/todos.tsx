import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { auth } from "#/lib/auth";
import { reportError } from "#/lib/error-report";
import { orpc } from "#/orpc/client";

const requireSignedIn = createServerFn({ method: "GET" }).handler(async () => {
	const session = await auth.api.getSession({
		headers: new Headers(getRequestHeaders() as Record<string, string>),
	});
	return Boolean(session?.user);
});

export const Route = createFileRoute("/demo/todos")({
	beforeLoad: async () => {
		const signedIn = await requireSignedIn();
		if (!signedIn) {
			throw redirect({ to: "/login" });
		}
	},
	component: TodosPage,
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery(
			orpc.listTodos.queryOptions({ input: {} }),
		);
	},
});

function TodosPage() {
	const { data, refetch } = useQuery(
		orpc.listTodos.queryOptions({ input: {} }),
	);
	const [title, setTitle] = useState("");
	const { mutate: addTodo, isPending } = useMutation(
		orpc.addTodo.mutationOptions({
			onSuccess: () => {
				setTitle("");
				void refetch();
			},
			onError: (err) => reportError(err, { fallback: "Failed to add todo." }),
		}),
	);

	return (
		<main className="flex min-h-[80vh] items-center justify-center px-4 py-10">
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle>Todos</CardTitle>
					<CardDescription>
						Backed by ZenStack v3 + PostgreSQL. Requires sign-in.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							if (!title.trim()) return;
							addTodo({ title: title.trim() });
						}}
						className="flex gap-2"
					>
						<Input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="What needs to be done?"
						/>
						<Button type="submit" disabled={isPending || !title.trim()}>
							Add
						</Button>
					</form>

					<ul className="space-y-2">
						{data?.map((todo) => (
							<li key={todo.id} className="rounded-md border px-3 py-2 text-sm">
								{todo.title}
							</li>
						))}
						{data?.length === 0 && (
							<li className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
								No todos yet. Add one above.
							</li>
						)}
					</ul>
				</CardContent>
			</Card>
		</main>
	);
}
