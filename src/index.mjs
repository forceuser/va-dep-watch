import process from "process";
import $path from "path";
import fs from "fs-extra";
import precinct from "precinct";
import chokidar from "chokidar";
import shell from "shelljs";
import less from "less";
import "colors";

let lastProcess;
export async function execOne (command, options = {}) {
	try {
		lastProcess && lastProcess.kill("SIGINT");
	}
	catch (error) {
		//
	}
	lastProcess = null;
	return new Promise((resolve, reject) => {
		lastProcess = shell.exec(command, Object.assign({async: true}, options), (code, stdout, stderr) => {
			if (code !== 0) {
				const error = new Error();
				error.message = stderr;
				error.name = String(code);
				reject(error);
			}
			else {
				resolve(stdout);
			}
		});
	});
}

export function fileExists (path) {
	try {
		if (fs.existsSync(path)) {
			return true;
		}
	}
	catch (error) {
		console.error(error);
	}
	return false;
}

const __dirname = $path.dirname(new URL(import.meta.url).pathname);
const cwd = process.cwd();


async function lessAST (filename, options) {
	options = options || {};
	options.filename = filename;
	const fileContent = await fs.readFile(filename, "utf8");
	return new Promise((resolve, reject) => {
		less.parse(fileContent, options, (error, astTree) => {
			if (error) {
				reject(error);
			}
			else {
				resolve(astTree);
			}
		});
	});
}

function findLessImports (ast, result = []) {
	ast.forEach(rule => {
		if (rule.constructor.name === "Import") {
			result.push(rule.path.value);
		}
		else if (rule.rules) {
			findLessImports(rule.rules, result);
		}
	});
	return result;
}
async function findLessDeps (path, options = {}) {
	const dir = $path.dirname(path);
	let ast;
	try {
		ast = await lessAST(path, Object.assign({}, options, {processImports: false}));
	}
	catch (error) {
		//
		console.log("error", error);
	}
	return findLessImports((ast || {}).rules || []).map(path => $path.resolve(dir, path));
}

export default async function main (argv) {
	let {entry, command, name, callback, options, rootpath} = argv;
	const moduleType = $path.extname(entry).replace(/^\./, "");
	if (options && typeof options === "string") {
		options = JSON.parse(options);
	}
	options = options || {};
	if (rootpath) {
		options.rootpath = rootpath;
	}
	async function findDepsRecursive (path, result = []) {
		if (!$path.extname(path)) {
			path += $path.extname(entry);
		}
		result.push(path);
		if (!fileExists(path)) {
			return result;
		}
		const dir = $path.dirname(path);
		const deps = await (async () => {
			if (moduleType === "less") {
				return findLessDeps(path, options);
			}
			return (precinct.paperwork($path.resolve(cwd, path), options) || []).map(p => $path.resolve(dir, p));
		})();
		// console.log("deps", path, deps);
		await Promise.all(deps.map(async dep => {
			if (!result.includes(dep)) {
				await findDepsRecursive(dep, result);
			}
		}));
		return result;
	}
	let deps = [];
	const watcher = chokidar.watch(deps, {ignoreInitial: true});
	const updateDeps = async () => {

		try {
			watcher.unwatch(deps);
			deps = await findDepsRecursive($path.resolve(cwd, entry));
			watcher.add(deps);
			// console.log(deps.join("\n"));
		}
		catch (error) {
			console.log("error", error);
		}

	};
	let timer;
	const onFileChange = (eventType) => async (path) => {
		try {
			console.log(`[${name || "-"}]`.blue, `${eventType}: ${$path.relative(cwd, path)}`[{remove: "red", add: "green", change: "blue"}[eventType]]);
			updateDeps();
			clearTimeout(timer);
			timer = setTimeout(() => {
				if (typeof callback === "function") {
					callback(eventType, path);
				}
				command && execOne(command);
			}, 1000);
		}
		catch (error) {
			console.log("error", error);
		}
	};
	watcher
		.on("add", onFileChange("add"))
		.on("change", onFileChange("change"))
		.on("unlink", onFileChange("remove"));

	console.log(`[${name || "-"}]`.blue, "start watching dependencies", `${entry}`.blue);
	updateDeps();
}
