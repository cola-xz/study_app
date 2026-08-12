<template>
	<view class="tree-node-wrap">
		<!-- 目录节点 -->
		<view
			v-if="node.isDir"
			class="trow trow-dir"
			:style="{ paddingLeft: (depth * 26 + 10) + 'rpx' }"
			@click="onDirTap"
		>
			<text class="trow-arrow" :class="{ 'trow-arrow-open': node.expanded }">»</text>
			<text class="trow-icon trow-icon-dir">📁</text>
			<text class="trow-name trow-dir-name">{{ node.name }}</text>
			<text class="trow-count">{{ dirFileCount(node) }}</text>
		</view>

		<!-- 文件节点 -->
		<view
			v-else
			class="trow trow-file"
			:class="{ 'trow-file-active': isActive }"
			:style="{ paddingLeft: (depth * 26 + 10) + 'rpx' }"
			@click="onFileTap"
		>
			<text class="trow-arrow trow-arrow-blank">»</text>
			<text class="trow-icon trow-icon-file">🎬</text>
			<text class="trow-name trow-file-name">{{ node.name }}</text>
		</view>

		<!-- 子节点 -->
		<view v-if="node.isDir && node.expanded && node.children && node.children.length" class="trow-children">
			<view v-for="child in node.children" :key="child.id" class="trow-child-wrap">
				<tree-node
					:node="child"
					:depth="depth + 1"
					:active-id="activeId"
					@toggle="toggle"
					@select="select"
				/>
			</view>
		</view>
	</view>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

type TreeNodeData = {
	id: string
	name: string
	raw?: any
	isDir: boolean
	level: number
	expanded: boolean
	children: TreeNodeData[]
}

const props = defineProps<{
	node: TreeNodeData
	depth: number
	activeId: string
}>()

const emit = defineEmits<{
	(e: 'toggle', node: TreeNodeData): void
	(e: 'select', item: TreeNodeData): void
}>()

const isActive = computed(() => {
	if (props.node.isDir) return false
	return props.node.id === props.activeId
})

function onDirTap() {
	emit('toggle', props.node)
}

function onFileTap() {
	if (props.node.raw) {
		emit('select', props.node)
	}
}

function toggle(node: TreeNodeData) {
	emit('toggle', node)
}

function select(item: TreeNodeData) {
	emit('select', item)
}

/**
 * 统计目录（含子目录）下的文件数量
 */
function dirFileCount(node: TreeNodeData): number {
	let count = 0
	const walk = (cur: TreeNodeData) => {
		for (const child of cur.children) {
			if (child.isDir) {
				walk(child)
			} else {
				count++
			}
		}
	}
	walk(node)
	return count
}
</script>

<style scoped>
	.trow {
		display: flex;
		align-items: center;
		margin: 4rpx 12rpx;
		padding: 14rpx 20rpx;
		border-radius: 14rpx;
		box-sizing: border-box;
		transition: background-color 0.2s;
		cursor: pointer;
	}

	.trow:active {
		background-color: #f0f2f8;
	}

	.trow-arrow {
		width: 30rpx;
		font-size: 20rpx;
		color: #b0b6c4;
		text-align: center;
		flex-shrink: 0;
		align-self: flex-start;
		margin-top: 6rpx;
		transition: transform 0.18s;
	}

	.trow-arrow.trow-arrow-open {
		transform: rotate(90deg);
	}

	.trow-arrow-blank {
		color: transparent;
	}

	.trow-icon {
		width: 40rpx;
		font-size: 32rpx;
		text-align: center;
		flex-shrink: 0;
		margin-right: 14rpx;
		align-self: flex-start;
	}

	.trow-icon-dir {
		margin-top: 0;
	}

	.trow-icon-file {
		margin-top: 2rpx;
	}

	.trow-name {
		flex: 1;
		min-width: 0;
		font-size: 28rpx;
		color: #333333;
		line-height: 1.4;
		word-break: break-all;
		white-space: normal;
	}

	.trow-dir-name {
		color: #4a4a5a;
		font-weight: 500;
	}

	.trow-file-name {
		color: #303640;
	}

	.trow-file-active {
		background-color: #edf3ff;
	}

	.trow-file-active .trow-file-name {
		color: #2f6bff;
		font-weight: 600;
	}

	.trow-count {
		flex-shrink: 0;
		font-size: 22rpx;
		color: #9aa0b4;
		background-color: #f0f2f8;
		padding: 2rpx 14rpx;
		border-radius: 18rpx;
		margin-left: 12rpx;
	}

	.trow-child-wrap {
		width: 100%;
	}
</style>
