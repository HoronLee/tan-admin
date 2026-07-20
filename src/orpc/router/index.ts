import {
	addMemberToOrganization,
	create as createOrganizationAdmin,
	dissolve as dissolveOrganizationAdmin,
	list as listOrganizationsAdmin,
} from "./organizations-admin";
import { getUserMenus } from "./user-menus";

export default {
	// Dynamic menus for current user
	getUserMenus,
	// Site-level super-admin cross-org management (R10).
	organizationsAdmin: {
		list: listOrganizationsAdmin,
		create: createOrganizationAdmin,
		dissolve: dissolveOrganizationAdmin,
		addMember: addMemberToOrganization,
	},
};
