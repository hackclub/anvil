import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['build/**', '.svelte-kit/**', 'drizzle/**', 'static/**']
	},
	{
		files: ['**/*.ts'],
		extends: [tseslint.configs.base],
		rules: {
			'padding-line-between-statements': ['error', { blankLine: 'always', prev: 'if', next: '*' }]
		}
	}
);
