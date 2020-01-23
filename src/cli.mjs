#!/bin/sh
":" //# comment; exec /usr/bin/env node --experimental-modules --no-warnings "$0" "$@"
import yargs from "yargs";
import main from "./index.mjs";


const argv = yargs(process.argv.slice(2))
	.command("$0 [entry] [command]", "watch dependency tree and execute command",
		(yargs) => {
			yargs
				.positional("entry", {
					alias: ["e", "i"],
					describe: "entry point to watch",
					type: "string",
				})
				.positional("command", {
					alias: ["c"],
					describe: "command to execute",
					type: "string",
				})
				.option("name", {
					alias: ["n"],
					describe: "name to display in console log",
					type: "string",
				});
		},
		(argv) => {
			main(argv);
		})
	.help()
	.argv;
