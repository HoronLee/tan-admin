import * as navigation from "./navigation";
import {
	addMemberToOrganization,
	create as createOrganizationAdmin,
	dissolve as dissolveOrganizationAdmin,
	list as listOrganizationsAdmin,
} from "./organizations-admin";

export default {
	// Dynamic navigation projection shared by workspace and site shells.
	navigation,
	// Site-level super-admin cross-org management (R10).
	organizationsAdmin: {
		list: listOrganizationsAdmin,
		create: createOrganizationAdmin,
		dissolve: dissolveOrganizationAdmin,
		addMember: addMemberToOrganization,
	},
};
