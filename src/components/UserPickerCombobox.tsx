/**
 * UserPickerCombobox — site-admin user picker (R2).
 *
 * Wraps shadcn `Command` + `Popover` (the canonical Combobox pattern from
 * https://ui.shadcn.com/docs/components/combobox) with a debounced
 * `authClient.admin.listUsers` query.
 *
 * **Privacy**: this component intentionally lives outside member-facing
 * surfaces. It is only safe to embed in `site/*` routes (super-admin gate)
 * because `admin.listUsers` returns email + name across the whole tenant —
 * exposing it under an org owner would defeat
 * `emailEnumerationProtection`.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { authClient } from "#/lib/auth/client";
import { cn } from "#/lib/utils";
import * as m from "#/paraglide/messages";

interface PickerUser {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role?: string | null;
}

interface UserPickerComboboxProps {
	value: string | null;
	onChange: (userId: string | null, user: PickerUser | null) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
}

const DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 10;

/**
 * Local debounce hook. Project already uses `@tanstack/react-pacer`'s
 * `useDebouncer` for fire-and-forget side effects (signup username
 * availability), but here we want a derived **value** to feed into a
 * `useQuery` key — a tiny dedicated hook is clearer than coercing the
 * pacer API.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(handle);
	}, [value, delay]);
	return debounced;
}

export function UserPickerCombobox({
	value,
	onChange,
	placeholder,
	disabled,
	id,
}: UserPickerComboboxProps) {
	const reactId = useId();
	const triggerId = id ?? reactId;
	const [open, setOpen] = useState(false);
	const [input, setInput] = useState("");
	const debounced = useDebouncedValue(input.trim(), DEBOUNCE_MS);

	// Cache the last selection so the trigger label survives even after the
	// user types a different query (BA's `listUsers` won't return the
	// already-selected user unless it matches the current search).
	const [selected, setSelected] = useState<PickerUser | null>(null);

	const searchQuery = useQuery({
		queryKey: ["user-picker", "list-users", debounced],
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUsers({
				query: debounced
					? {
							searchValue: debounced,
							searchField: "email",
							searchOperator: "contains",
							limit: SEARCH_LIMIT,
						}
					: { limit: SEARCH_LIMIT },
			});
			if (error) throw new Error(error.message);
			return (data?.users ?? []) as unknown as PickerUser[];
		},
		// Keep the popover responsive — stale results show while a new
		// search is in flight rather than collapsing to a spinner.
		placeholderData: (prev) => prev,
		enabled: open,
	});

	const users = searchQuery.data ?? [];

	function handleSelect(user: PickerUser) {
		setSelected(user);
		onChange(user.id, user);
		setOpen(false);
		setInput("");
	}

	const triggerLabel = selected
		? selected.email
		: (placeholder ?? m.user_picker_placeholder());

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={triggerId}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"w-full justify-between font-normal",
						!selected && "text-muted-foreground",
					)}
				>
					<span className="truncate">{triggerLabel}</span>
					<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[--radix-popover-trigger-width] min-w-[280px] p-0"
				align="start"
			>
				<Command shouldFilter={false}>
					<CommandInput
						value={input}
						onValueChange={setInput}
						placeholder={m.user_picker_search_placeholder()}
					/>
					<CommandList>
						{searchQuery.isFetching && users.length === 0 ? (
							<div className="py-6 text-center text-sm text-muted-foreground">
								{m.common_loading()}
							</div>
						) : null}
						{!searchQuery.isFetching && users.length === 0 ? (
							<CommandEmpty>{m.user_picker_no_results()}</CommandEmpty>
						) : null}
						{users.length > 0 ? (
							<CommandGroup>
								{users.map((user) => (
									<CommandItem
										key={user.id}
										value={user.id}
										onSelect={() => handleSelect(user)}
									>
										<Avatar className="size-7">
											{user.image ? (
												<AvatarImage src={user.image} alt={user.name} />
											) : null}
											<AvatarFallback className="text-xs">
												{user.name.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<div className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-sm font-medium">
												{user.email}
											</span>
											<span className="truncate text-xs text-muted-foreground">
												{user.name}
											</span>
										</div>
										{user.role ? (
											<Badge variant="outline" className="ml-2 shrink-0">
												{user.role}
											</Badge>
										) : null}
										<CheckIcon
											className={cn(
												"ml-2 size-4 shrink-0",
												value === user.id ? "opacity-100" : "opacity-0",
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
