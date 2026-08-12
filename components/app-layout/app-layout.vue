<template>
	<view class="app-layout">
		<!-- 顶部导航栏 -->
		  <view class="nav-bar">
			<view class="box-bg">
			  <uni-nav-bar
			    height="85rpx"
				color="#999"
				backgroundColor="#f5f5f5"
				shadow
			  >
					<view
						class="nav-bar-title"
						:class="{ 'nav-bar-title-dropdown': childMenus.length }"
						@click="toggleDropdown"
					>
						<text class="nav-bar-title-text">{{ title }}</text>
						<text
							v-if="childMenus.length"
							class="dropdown-title-arrow"
							:class="{ 'dropdown-trigger-arrow-open': dropdownOpen }"
						>▾</text>
					</view>
					<view v-if="childMenus.length && dropdownOpen" class="dropdown-panel" @click="dropdownOpen = false">
						<view
							v-for="menu in childMenus"
							:key="menu.path"
							class="dropdown-item"
							:class="{ 'dropdown-item-active': isActive(menu) }"
							@click.stop="handleMenuTap(menu)"
						>
							<text class="dropdown-item-title">{{ menu.title }}</text>
						</view>
					</view>
					<template v-slot:left>
						<uni-icons type="left" size="26" @click="handleBack" v-if="showBack"></uni-icons>
					</template>
					<template v-slot:right>
						<view class="nav-bar-right">
							<!-- <view class="info-trigger" @click="openInfoPopup">
								<text class="info-trigger-text">信息</text>
							</view> -->
							<slot name="nav-right"></slot>
						</view>
					</template>
			  </uni-nav-bar>
			</view>
		  </view>

		<!-- 页面主体内容 -->
		<view class="app-layout-body">
			<slot></slot>
		</view>

		<!-- 底部固定菜单栏 -->
		<view v-if="tabList.length" class="bottom-menu">
			<view
				v-for="item in tabList"
				:key="item.path"
				class="bottom-menu-item"
				:class="{ 'bottom-menu-item-active': isActive(item) }"
				@click="handleMenuTap(item)"
			>
				<text class="bottom-menu-item-title">{{ item.title }}</text>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useRouterStore } from '@/store/modules/router'
import { getCurrentPage, getRouteMeta, guardCurrentPage } from '@/utils/router'

const props = withDefaults(
	defineProps<{
		title?: string
		showBack?: boolean
	}>(),
	{
		title: '',
		showBack: true
	}
)

interface MenuItem {
	name: string
	title: string
	path: string
	children?: MenuItem[]
}

const routerStore = useRouterStore()

const tabList = computed<MenuItem[]>(() => routerStore.getTabList || [])

/**
 * 收集当前激活的顶部菜单项下的子路由
 * 仅当当前页面命中某顶层菜单（或其子级）时，返回该子菜单；否则为空
 */
const childMenus = computed<MenuItem[]>(() => {
	if (!activePath.value) return []
	for (const item of tabList.value) {
		if (item.children && item.children.length > 0) {
			const match = findMenuByPath(item.children, activePath.value)
			if (match) {
				return item.children
			}
		}
	}
	return []
})

/**
 * 在菜单树中查找路径匹配的节点
 */
function findMenuByPath(items: MenuItem[], path: string): MenuItem | null {
	for (const item of items) {
		if (item.path === path) return item
		if (item.children && item.children.length > 0) {
			const found = findMenuByPath(item.children, path)
			if (found) return found
		}
	}
	return null
}

const dropdownOpen = ref(false)

/**
 * 点击标题切换下拉框；无子菜单时无动作
 */
function toggleDropdown() {
	if (!childMenus.value.length) return
	dropdownOpen.value = !dropdownOpen.value
}

const activePath = ref('')

// 常驻信息弹窗
const infoPopupVisible = ref(false)

/**
 * 当前激活的顶部菜单项（当前页面命中的顶层菜单）
 */
const activeMenuInfo = computed<MenuItem | null>(() => {
	if (!activePath.value) return null
	for (const item of tabList.value) {
		if (item.path === activePath.value) return item
		if (item.children && item.children.length > 0) {
			const match = findMenuByPath(item.children, activePath.value)
			if (match) return item
		}
	}
	return null
})

function openInfoPopup() {
	infoPopupVisible.value = true
}

function closeInfoPopup() {
	infoPopupVisible.value = false
}

const title = ref(props.title)

onLoad(() => {
	// 先同步标题与激活菜单，确保导航栏始终有内容
	setPageTitle()
	syncActivePath()

	// 页面级登录兜底校验：未登录时跳转登录页
	if (!guardCurrentPage()) return
})

onShow(() => {
	setPageTitle()
	syncActivePath()
})

// 动态菜单异步加载完成后，重新同步标题（刷新场景下首次 onShow 时菜单可能尚未就绪）
watch(
	() => routerStore.getTabList,
	() => {
		if (tabList.value.length) {
			setPageTitle()
		}
	}
)

/**
 * 根据当前页面路径自动从路由配置表读取标题
 * 优先从动态菜单（tabList）中匹配，其次从静态路由元信息读取，未配置时回退为手动传入的 title prop
 */
function setPageTitle() {
	const path = getCurrentPage()
	if (!path) return
	// 从动态菜单中查找标题（响应式，generateRoutes 完成后会自动更新）
	const menuTitle = findMenuTitle(tabList.value, path)
	if (menuTitle) {
		title.value = menuTitle
		return
	}
	const meta = getRouteMeta(path)
	title.value = (meta && meta.title) || props.title
}

/**
 * 在菜单树中查找路径对应的标题
 */
function findMenuTitle(items: MenuItem[] | undefined, path: string): string {
	if (!items) return ''
	for (const item of items) {
		if (item.path === path) return item.title
		const childTitle = findMenuTitle(item.children, path)
		if (childTitle) return childTitle
	}
	return ''
}

/**
 * 同步当前激活的菜单路径
 */
function syncActivePath() {
	activePath.value = getCurrentPage()
}

/**
 * 判断菜单项是否为当前激活页面
 * 有子菜单时，任一子路由匹配即视为激活
 */
function isActive(item: MenuItem): boolean {
	if (activePath.value === item.path) return true
	if (item.children && item.children.length > 0) {
		return item.children.some((child) => isActive(child))
	}
	return false
}

/**
 * 取菜单项要跳转的默认路由：有子菜单时跳第一个子路由，否则跳自身
 */
function getDefaultPath(item: MenuItem): string {
	if (item.children && item.children.length > 0) {
		return getDefaultPath(item.children[0])
	}
	return item.path
}

/**
 * 点击底部菜单项跳转
 */
function handleMenuTap(item: MenuItem) {
	const target = getDefaultPath(item)
	if (activePath.value === target) return
	uni.navigateTo({ url: target })
}

function handleBack() {
	uni.navigateTo({ url: '/pages/home/home' })
}
</script>

<style>
	.app-layout {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background-color: #f5f6fa;
		box-sizing: border-box;
		padding-top: var(--status-bar-height, 0px);
	}

	.nav-bar {
		position: sticky;
		top: 0;
		z-index: 100;
		width: 100%;
		background-color: #ffffff;
	}

	.nav-bar-title {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 85rpx;
	}

	.nav-bar-title-dropdown {
		cursor: pointer;
	}

	.nav-bar-title-text {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.dropdown-title-arrow {
		margin-left: 8rpx;
		font-size: 20rpx;
		color: #666666;
		transition: transform 0.2s;
	}

	.dropdown-trigger-arrow-open {
		transform: rotate(180deg);
	}

	.nav-bar-right {
		position: absolute;
		right: 0;
		display: flex;
		align-items: center;
		height: 100%;
		padding: 0 24rpx;
		z-index: 10;
	}

	.dropdown-panel {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		z-index: 110;
		min-width: 200rpx;
		background-color: #ffffff;
		border-radius: 0 0 12rpx 12rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.12);
		overflow: hidden;
	}

	.dropdown-item {
		padding: 24rpx;
	}

	.dropdown-item:active {
		background-color: #f5f6fa;
	}

	.dropdown-item-title {
		font-size: 28rpx;
		color: #333333;
	}

	.dropdown-item-active {
		background-color: rgba(41, 121, 255, 0.08);
	}

	.dropdown-item-active .dropdown-item-title {
		color: #2979ff;
		font-weight: 600;
	}

	.app-layout-body {
		flex: 1;
		width: 100%;
		padding-bottom: calc(100rpx + env(safe-area-inset-bottom));
		padding-bottom: calc(100rpx + constant(safe-area-inset-bottom));
	}

	.bottom-menu {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		background-color: #ffffff;
		box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
		padding-bottom: constant(safe-area-inset-bottom);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.bottom-menu-item {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100rpx;
	}

	.bottom-menu-item-title {
		font-size: 26rpx;
		color: #999999;
	}

	.bottom-menu-item-active {
		border-top: 4rpx solid #2979ff;
	}

	.bottom-menu-item-active .bottom-menu-item-title {
		color: #2979ff;
		font-weight: 600;
	}

	.info-trigger {
		display: flex;
		align-items: center;
		padding: 8rpx 16rpx;
		border-radius: 8rpx;
		background-color: #f5f6fa;
	}

	.info-trigger-text {
		font-size: 26rpx;
		color: #333333;
	}

	.info-popup-mask {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 999;
		background-color: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.info-popup {
		width: 80%;
		max-height: 70vh;
		background-color: #ffffff;
		border-radius: 16rpx;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.info-popup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 30rpx;
		border-bottom: 1rpx solid #f0f0f0;
	}

	.info-popup-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.info-popup-close {
		font-size: 40rpx;
		color: #999999;
		line-height: 1;
	}

	.info-popup-body {
		padding: 30rpx;
		overflow-y: auto;
	}

	.info-popup-row {
		display: flex;
		align-items: flex-start;
		margin-bottom: 16rpx;
	}

	.info-popup-row-col {
		flex-direction: column;
	}

	.info-popup-label {
		font-size: 28rpx;
		color: #666666;
		margin-right: 12rpx;
	}

	.info-popup-value {
		font-size: 28rpx;
		color: #333333;
		flex: 1;
	}

	.info-popup-children {
		display: flex;
		flex-direction: column;
		margin-top: 8rpx;
	}

	.info-popup-child-item {
		font-size: 26rpx;
		color: #555555;
		margin-bottom: 8rpx;
	}
</style>
