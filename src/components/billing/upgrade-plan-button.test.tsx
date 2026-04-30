// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	UpgradePlanButton,
	UpgradePlanCard,
} from "#/components/billing/upgrade-plan-button";

// jsdom 不带 ResizeObserver。某些 Radix 子组件初始化时探测；shim 一份避免噪音。
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe("UpgradePlanButton", () => {
	it("renders nothing in private mode", () => {
		vi.stubEnv("VITE_PRODUCT_MODE", "private");
		const { container } = render(<UpgradePlanButton plan="free" />);
		expect(container.firstChild).toBeNull();
	});

	it("renders nothing for enterprise plan in saas mode", () => {
		vi.stubEnv("VITE_PRODUCT_MODE", "saas");
		const { container } = render(<UpgradePlanButton plan="enterprise" />);
		expect(container.firstChild).toBeNull();
	});

	it("renders the upgrade button for free plan in saas mode", () => {
		vi.stubEnv("VITE_PRODUCT_MODE", "saas");
		render(<UpgradePlanButton plan="free" />);
		expect(screen.getByRole("button", { name: /upgrade|升级/i })).toBeDefined();
	});

	it("renders the upgrade button for team_pro plan in saas mode", () => {
		vi.stubEnv("VITE_PRODUCT_MODE", "saas");
		render(<UpgradePlanButton plan="team_pro" />);
		expect(screen.getByRole("button", { name: /upgrade|升级/i })).toBeDefined();
	});
});

describe("UpgradePlanCard", () => {
	it("does not render in private mode", () => {
		vi.stubEnv("VITE_PRODUCT_MODE", "private");
		const { container } = render(<UpgradePlanCard plan="free" />);
		expect(container.firstChild).toBeNull();
	});

	it("does not render when plan is enterprise (already top tier)", () => {
		vi.stubEnv("VITE_PRODUCT_MODE", "saas");
		const { container } = render(<UpgradePlanCard plan="enterprise" />);
		expect(container.firstChild).toBeNull();
	});

	it("renders the card with upgrade button when plan is free in saas mode", () => {
		vi.stubEnv("VITE_PRODUCT_MODE", "saas");
		render(<UpgradePlanCard plan="free" />);
		const buttons = screen.getAllByRole("button", { name: /upgrade|升级/i });
		expect(buttons.length).toBeGreaterThan(0);
	});
});
