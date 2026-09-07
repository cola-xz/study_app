/**
 * 极简 UUID 生成（跨端/无 npm 依赖，仅此一处使用，避免再引入三方 uuid）
 * 返回形如 b7e9c6a4-... 的标准 v4 格式字符串。
 */
export function generateUUID(): string {
	// 用时间戳 + 随机数生成 4 个可拼接片段，保证足够随机
	const s4 = (): string =>
		Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1)
	return (
		s4() +
		s4() +
		'-' +
		s4() +
		'-4' +
		s4().substring(0, 3) +
		'-' +
		s4() +
		'-' +
		s4() +
		s4() +
		s4()
	).toLowerCase()
}
