/** @type {import('syncpack').Config} */
module.exports = {
  indent: '  ',
  sortAz: [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'resolutions',
    'overrides',
  ],
  sortFirst: [
    'name',
    'version',
    'private',
    'description',
    'author',
    'license',
    'main',
    'module',
    'types',
    'exports',
    'files',
    'scripts',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'workspaces',
  ],
  versionGroups: [
    {
      label: '모노레포 내부 패키지는 workspace:*를 사용합니다',
      packages: ['**'],
      dependencies: ['@fantasy-diary/*'],
      dependencyTypes: ['prod', 'dev', 'peer'],
      pinVersion: 'workspace:*',
    },
  ],
  semverGroups: [
    {
      label: '모든 의존성에 캐럿(^) 범위를 사용합니다',
      packages: ['**'],
      dependencies: ['**'],
      dependencyTypes: ['prod', 'dev'],
      range: '^',
    },
  ],
};
