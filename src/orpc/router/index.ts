import {
	createMenu,
	deleteMenu,
	getMenu,
	listMenus,
	updateMenu,
} from "./menus";
import {
	createPermission,
	deletePermission,
	getPermission,
	listPermissions,
	updatePermission,
} from "./permissions";
import {
	createRole,
	deleteRole,
	getRole,
	listRoles,
	updateRole,
} from "./roles";
import { addTodo, listTodos } from "./todos";
import { assignRole, listMyRoles, revokeRole } from "./user-roles";

export default {
	// Todos (demo)
	listTodos,
	addTodo,
	// Roles
	listRoles,
	getRole,
	createRole,
	updateRole,
	deleteRole,
	// Permissions
	listPermissions,
	getPermission,
	createPermission,
	updatePermission,
	deletePermission,
	// Menus
	listMenus,
	getMenu,
	createMenu,
	updateMenu,
	deleteMenu,
	// User-Role assignments
	listMyRoles,
	assignRole,
	revokeRole,
};
