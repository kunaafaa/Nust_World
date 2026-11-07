import next from 'eslint-config-next/core-web-vitals';

export default [
  ...next,
  { ignores: ['.next/**', 'public/**', 'scripts/**'] },
  {
    // React Three Fiber code mutates three.js objects (materials, cameras, instanced meshes) every frame by design.
    // The React Compiler immutability/refs rules are written for plain React state and flag that intended pattern.
    files: ['src/scene/**'],
    rules: { 'react-hooks/immutability': 'off', 'react-hooks/refs': 'off' },
  },
];
