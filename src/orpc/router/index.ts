import {
	createMenu,
	deleteMenu,
	getMenu,
	listMenus,
	updateMenu,
} from "./menus";
import { addTodo, listTodos } from "./todos";
import { getUserMenus } from "./user-menus";

export default {
	// Todos (demo)
	listTodos,
	addTodo,
	// Menus
	listMenus,
	getMenu,
	createMenu,
	updateMenu,
	deleteMenu,
	// Dynamic menus for current user
	getUserMenus,
};
