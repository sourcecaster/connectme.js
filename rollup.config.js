import { terser } from 'rollup-plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default [
	{
		input: 'lib/connectme.mjs',
		output: {
			sourcemap: true,
			format: 'iife',
			name: 'connectme',
			file: 'build/connectme.min.js'
		},
		plugins: [
			production && terser()
		],
		watch: {
			clearScreen: false
		}
	}
];
