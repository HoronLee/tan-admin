// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanBadge } from "#/components/layout/plan-badge";

afterEach(() => {
	cleanup();
});

describe("PlanBadge", () => {
	it("renders the Free label for plan=free", () => {
		render(<PlanBadge plan="free" />);
		expect(screen.getByText("Free")).toBeDefined();
	});

	it("renders Personal Pro for personal_pro", () => {
		render(<PlanBadge plan="personal_pro" />);
		expect(screen.getByText("Personal Pro")).toBeDefined();
	});

	it("renders Team Pro for team_pro", () => {
		render(<PlanBadge plan="team_pro" />);
		expect(screen.getByText("Team Pro")).toBeDefined();
	});

	it("renders enterprise label with sparkle decoration", () => {
		render(<PlanBadge plan="enterprise" />);
		// label includes a sparkle prefix; assert via substring match.
		expect(screen.getByText(/Enterprise/)).toBeDefined();
	});

	it("falls back to Free for unknown plan strings", () => {
		render(<PlanBadge plan="mystery_tier" />);
		expect(screen.getByText("Free")).toBeDefined();
	});

	it("falls back to Free for null plan", () => {
		render(<PlanBadge plan={null} />);
		expect(screen.getByText("Free")).toBeDefined();
	});

	it("falls back to Free for undefined plan", () => {
		render(<PlanBadge plan={undefined} />);
		expect(screen.getByText("Free")).toBeDefined();
	});
});
