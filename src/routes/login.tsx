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

type Mode = "signin" | "signup";

function LoginPage() {
	const router = useRouter();
	const [mode, setMode] = useState<Mode>("signin");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			if (mode === "signin") {
				const { error } = await authClient.signIn.email({ email, password });
				if (error) throw new Error(error.message);
			} else {
				const { error } = await authClient.signUp.email({
					email,
					password,
					name: name || email,
				});
				if (error) throw new Error(error.message);
			}
			await router.navigate({ to: "/" });
		} catch (err) {
			reportError(err, {
				fallback:
					mode === "signin"
						? "Failed to sign in."
						: "Failed to create account.",
			});
		} finally {
			setSubmitting(false);
		}
	}

	const isSignUp = mode === "signup";

	return (
		<main className="flex min-h-[80vh] items-center justify-center px-4 py-10">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{isSignUp ? "Create account" : "Sign in"}</CardTitle>
					<CardDescription>
						{isSignUp
							? "Use email + password to register."
							: "Access your Todo list."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						{isSignUp && (
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Optional"
									autoComplete="name"
								/>
							</div>
						)}
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								autoComplete="email"
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
								autoComplete={isSignUp ? "new-password" : "current-password"}
							/>
						</div>
						<Button type="submit" disabled={submitting} className="w-full">
							{submitting
								? "Please wait…"
								: isSignUp
									? "Create account"
									: "Sign in"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							className="w-full"
							onClick={() => setMode(isSignUp ? "signin" : "signup")}
						>
							{isSignUp
								? "Already have an account? Sign in"
								: "Need an account? Sign up"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
