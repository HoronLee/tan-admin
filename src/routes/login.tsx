import { createFileRoute, useRouter } from "@tanstack/react-router";
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
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth-client";
import { reportError } from "#/lib/error-report";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			const { error } = await authClient.signIn.email({ email, password });
			if (error) throw new Error(error.message);
			await router.navigate({ to: "/dashboard" });
		} catch (err) {
			reportError(err, { fallback: "Failed to sign in." });
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center px-4">
			<div className="w-full max-w-sm space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight">Tan Admin</h1>
					<p className="text-sm text-muted-foreground">
						Administration Platform
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>Sign in</CardTitle>
						<CardDescription>
							Enter your credentials to access the dashboard.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									autoComplete="email"
									placeholder="admin@example.com"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									minLength={8}
									autoComplete="current-password"
								/>
							</div>
							<Button type="submit" disabled={submitting} className="w-full">
								{submitting ? "Signing in..." : "Sign in"}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
