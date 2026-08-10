// src/stores/router.ts
import { defineStore } from 'pinia';
import { ROUTES, addRouteMeta } from '@/utils/router';
import { getMenus } from '@/api/user';
import { ref } from 'vue';

export const useRouterStore = defineStore({
  id: 'router',
  state: (): any => ({
    homePath: '',
	tabList: [] as any[],
  }),
  getters: {
    getHomePath: state => state.homePath,
	getTabList: state => state.tabList,
  },
  actions: {
	setTabList(tabList: any[]) {
		this.tabList =  tabList;
	},
    // 生成动态路由
    async generateRoutes() {
      try {
		const res = await getMenus({
			clientType: 'app',
		})
		if (res.code == 200) {
			interface MenuData {
			  id: string | number;
			  father_id: string | number | null;
			  title: string;
			  name: string;
			  path: string;
			  component: string | null;
			  hideMenu: number;
			  isHome: number;
			  isFrame: number;
			  frameSrc: string | null;
			  status: number;
			  createDate: string;
			  updateDate: string;
			  createBy: string;
			  updateBy: string;
			  icon: string;
			  isStatic: number;
			  order_id: number;
			  children?: MenuData[];
			}
			let menuList: any = ref([]);
			type SlimMenu = {
				name: string;
				path: string;
				title: string;
				children?: SlimMenu[];
			};
			function filterMenus(routes: MenuData[]): SlimMenu[] {
				return routes
					.filter((element) => element.hideMenu != 1)
					.sort((a, b) => a.order_id - b.order_id)
					.map((element) => {
						// 登记页面详细路由信息，供 app-layout 等自动读取标题
						addRouteMeta(element.path, { title: element.title, icon: element.icon })
						return {
							name: element.name,
							title: element.title,
							path: element.path,
							children: element.children && element.children.length > 0
								? filterMenus(element.children)
								: undefined,
						}
					});
			}
			function setRoutes(routes: any) {
				routes
					.sort((a: MenuData, b: MenuData) => a.order_id - b.order_id)
					.forEach((element: MenuData) => {
						if (element.children && element.children.length > 0) {
							setRoutes(element.children);
						} else {
							ROUTES[element.name] = element.path;
						}
					});
			}

			menuList.value = filterMenus(res.data);
			this.setTabList(menuList.value);
			setRoutes(res.data);
		}
      } catch (error) {
        throw error;
      }
    },

    // 重置路由
    resetRoutes() {
		this.homePath = '';
		this.tabList = [];
	},
  },
});
