import { PlusIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import * as m from "#/paraglide/messages";

export function CreateOrganizationButton({
	isPrivateMode,
	onClick,
}: {
	isPrivateMode: boolean;
	onClick: () => void;
}) {
	if (isPrivateMode) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button size="sm" disabled>
								<PlusIcon className="size-4" />
								{m.organizations_create_button()}
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{m.organizations_create_disabled_tooltip()}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}
	return (
		<Button size="sm" onClick={onClick}>
			<PlusIcon className="size-4" />
			{m.organizations_create_button()}
		</Button>
	);
}
