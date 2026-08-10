<script lang="ts">
import { isLogin, ROUTES } from '@/utils/router'
import { useUserStore } from './store/modules/user'

export default {
	onLaunch: function() {
		// 已登录用户冷启动：从登录启动页跳转到首页
		if (isLogin()) {
			uni.reLaunch({ url: ROUTES.home })

            const userStore = useUserStore();
			if (userStore.getUserInfo) {
				userStore.fetchUserInfo();
			}
		}
	},
	// onShow: function() {
	// 	console.log('App Show')
	// },
	// onHide: function() {
	// 	console.log('App Hide')
	// }
}
</script>

<style>
	/*每个页面公共css */
</style>
