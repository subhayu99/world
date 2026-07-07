// "Pencil & pastel" design language — light paper world, graphite linework,
// soft pastel accents. (File keeps the BLUEPRINT export name — every consumer
// reads these values; changing them here reskins the whole world.)
// Precision stays: no wobble, no faux-hand-drawn jitter.

export const BLUEPRINT = {
  ground: '#f6f4ee', // scene background + fog: warm paper
  groundDeep: '#efece3', // floors / darker planes
  face: '#faf9f4', // 3D solid faces (paper card faces, occludes)
  faceRaised: '#ffffff', // hovered/active faces
  line: '#4a4a48', // graphite edge/ink lines
  lineDim: 'rgba(74, 74, 72, 0.38)', // secondary lines
  gridMajor: 'rgba(74, 74, 72, 0.14)',
  gridMinor: 'rgba(74, 74, 72, 0.06)',
  accent: '#e08a7d', // pastel coral — highlights, hover, active
  accentWarm: '#d9b45f', // muted amber — awards, counts
  accentCool: '#8fb3d9', // pastel blue — tape, links, secondary pops
  textPrimary: '#3a3a38', // ink text
  textDim: 'rgba(58, 58, 56, 0.62)',
  paper: '#f6f4ee',
  ink: '#3a3a38',
} as const;

export const BLUEPRINT_FOG = { color: BLUEPRINT.ground, near: 16, far: 90 } as const;

/** Drafting lettering (Architects Daughter, OFL, self-hosted). */
export const DRAFT_FONT_PATH = 'fonts/ArchitectsDaughter-Regular.ttf';
export const DRAFT_FONT_FAMILY = 'Architects Daughter';
