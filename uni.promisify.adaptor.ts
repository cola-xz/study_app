uni.addInterceptor({
	returnValue(res: any) {
		if (!(!!res && (typeof res === "object" || typeof res === "function") && typeof res.then ===
			"function")) {
			return res;
		}
		return new Promise((resolve: any, reject: any) => {
			res.then((res: any) => {
				if (!res) return resolve(res)
				return res[0] ? reject(res[0]) : resolve(res[1])
			});
		});
	},
});
