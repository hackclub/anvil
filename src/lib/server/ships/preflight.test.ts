import { describe, expect, test } from 'bun:test';
import { analyzeReadme, isVideoLink } from './preflight';

describe('analyzeReadme', () => {
	test('flags known starter-template headings', () => {
		expect(analyzeReadme('# sv\n\nEverything you need to build a Svelte project')).not.toBeNull();
		expect(analyzeReadme('# Astro Starter Kit: Basics\n\nstuff')).not.toBeNull();
		expect(analyzeReadme('# Nuxt Minimal Starter\n\nLook at the docs')).not.toBeNull();
		expect(analyzeReadme('# Welcome to React Router!\n\ntemplate')).not.toBeNull();
		expect(analyzeReadme('# Getting Started with Create React App\n\nscripts')).not.toBeNull();
	});

	test('flags "+ Vite" template headings anywhere', () => {
		expect(analyzeReadme('# React + Vite\n\nThis template provides...')).not.toBeNull();
		expect(analyzeReadme('intro\n\n## Svelte + Vite\n\nmore')).not.toBeNull();
	});

	test('flags single-heading-only READMEs', () => {
		expect(analyzeReadme('# my-project')).not.toBeNull();
		expect(analyzeReadme('# my-project\n\n\n')).not.toBeNull();
	});

	test('flags empty READMEs', () => {
		expect(analyzeReadme('')).not.toBeNull();
		expect(analyzeReadme('   \n  \n')).not.toBeNull();
	});

	test('accepts real READMEs', () => {
		expect(
			analyzeReadme(
				'# termcast\n\nrecord + share terminal sessions as tiny text files.\n\n## install\n\n`npm i -g termcast`'
			)
		).toBeNull();

		expect(analyzeReadme('# my-tool\n\nA CLI that does a thing. Usage: `my-tool go`')).toBeNull();
	});
});

describe('isVideoLink', () => {
	test('detects video files and platforms', () => {
		expect(isVideoLink('https://example.com/demo.mp4')).toBe(true);
		expect(isVideoLink('https://example.com/demo.webm?query=1')).toBe(true);
		expect(isVideoLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
		expect(isVideoLink('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
		expect(isVideoLink('https://vimeo.com/12345')).toBe(true);
		expect(isVideoLink('https://www.loom.com/share/abc')).toBe(true);
	});

	test('leaves normal demos alone', () => {
		expect(isVideoLink('https://termcast.dev')).toBe(false);
		expect(isVideoLink('https://pypi.org/project/thing/')).toBe(false);
		expect(isVideoLink('https://github.com/user/repo/releases')).toBe(false);
	});
});
