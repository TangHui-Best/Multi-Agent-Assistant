import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
)

describe('repository baseline', () => {
  it('declares the desktop workflow scripts', () => {
    expect(packageJson.scripts).toMatchObject({
      dev: 'electron-vite dev',
      build: 'electron-vite build',
      test: 'vitest run',
      'test:e2e': 'playwright test'
    })
  })

  it('marks the repository as private until the first public release', () => {
    expect(packageJson.private).toBe(true)
  })
})
