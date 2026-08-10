<script lang="ts">
import { isLogin } from '@/utils/router'
import { useUserStore } from './store/modules/user'

export default {
	onLaunch: function() {
		// 已登录用户冷启动：刷新用户信息（不在此处强制 reLaunch 首页，
		// 避免 H5 刷新任意页面时被拉回首页；跳首页逻辑由登录启动页 onLoad 处理）
		if (isLogin()) {
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
