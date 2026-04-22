import {
	createMenu,
	deleteMenu,
	getMenu,
	listMenus,
	updateMenu,
} from "./menus";
import { getUserMenus } from "./user-menus";

export default {
	// Menus
	listMenus,
	getMenu,
	createMenu,
	updateMenu,
	deleteMenu,
	// Dynamic menus for current user
	getUserMenus,
};
