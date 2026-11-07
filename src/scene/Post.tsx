'use client';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useApp } from '@/store/useApp';

/** Bloom + vignette. Loaded only on the High tier (dynamic import) so phones never download the postprocessing library. */
export default function Post() {
  const night = useApp((s) => s.night);
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={night ? 1.1 : 0.7}
        luminanceThreshold={night ? 0.5 : 0.62}
        mipmapBlur
        radius={0.7}
      />
      <Vignette eskil={false} offset={0.25} darkness={0.55} />
    </EffectComposer>
  );
}
