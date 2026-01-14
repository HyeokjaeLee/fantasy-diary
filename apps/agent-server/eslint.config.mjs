import sharedConfig from '@fantasy-diary/configs/eslint'

export default [
  ...sharedConfig,
  {
    ignores: ['.next/', 'node_modules/', 'dist/'],
  },
]
