/** 为 process.env.NODE_ENV 提供类型声明 */
declare var process: {
	env: {
		/** 当前运行环境 */
		NODE_ENV: 'development' | 'staging' | 'production'
	}
}
